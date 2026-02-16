/**
 * NotebookLM to Zotero - Metadata Enrichment Module
 * Queries multiple APIs to enrich source metadata
 * v1.3.0
 */

// API Configuration
const APIS = {
  crossref: 'https://api.crossref.org/works',
  openalex: 'https://api.openalex.org/works',
  arxiv: 'https://export.arxiv.org/api/query',
  semanticScholar: 'https://api.semanticscholar.org/graph/v1/paper/search',
  // YouTube requires API key - user configurable
  youtube: 'https://www.googleapis.com/youtube/v3/videos'
};

// Rate limiting
const RATE_LIMITS = {
  crossref: 50, // requests per second
  openalex: 10,
  arxiv: 3,
  delay: 200 // ms between requests
};

/**
 * Main enrichment function
 * @param {Array} sources - Sources from NotebookLM
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Array>} Enriched sources
 */
async function enrichSources(sources, progressCallback) {
  const enriched = [];
  const results = {
    success: 0,
    partial: 0,
    failed: 0
  };
  
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    
    // Update progress
    progressCallback({
      current: i + 1,
      total: sources.length,
      source: source.title.substring(0, 60),
      status: 'Processing...'
    });
    
    try {
      // Enrich based on source type
      const enrichedSource = await enrichSource(source);
      
      // Determine success level based on metadata completeness
      const hasFullMetadata = enrichedSource.authors?.length > 0 && 
                             (enrichedSource.doi || enrichedSource.abstract || enrichedSource.journal);
      const hasPartialMetadata = enrichedSource.authors?.length > 0 || 
                                enrichedSource.doi || 
                                enrichedSource.abstract;
      
      if (hasFullMetadata) {
        results.success++;
        progressCallback({
          current: i + 1,
          total: sources.length,
          source: source.title.substring(0, 60),
          status: `✓ Full metadata retrieved`,
          type: 'success'
        });
      } else if (hasPartialMetadata) {
        results.partial++;
        progressCallback({
          current: i + 1,
          total: sources.length,
          source: source.title.substring(0, 60),
          status: `⚠ Partial metadata`,
          type: 'partial'
        });
      } else {
        results.failed++;
        progressCallback({
          current: i + 1,
          total: sources.length,
          source: source.title.substring(0, 60),
          status: '✗ No match found',
          type: 'failed'
        });
      }
      
      enriched.push(enrichedSource);
      
      // Rate limiting
      await sleep(RATE_LIMITS.delay);
      
    } catch (error) {
      console.error('Enrichment error:', error);
      results.failed++;
      enriched.push({ ...source, confidence: 0, error: error.message });
      
      progressCallback({
        current: i + 1,
        total: sources.length,
        source: source.title.substring(0, 60),
        status: `✗ Error: ${error.message}`,
        type: 'error'
      });
    }
  }
  
  // Final summary
  progressCallback({
    current: sources.length,
    total: sources.length,
    results: results,
    status: 'Complete!',
    type: 'complete'
  });
  
  return enriched;
}

/**
 * Enrich a single source
 */
async function enrichSource(source) {
  // NEW: Try hybrid extraction first (DOI or URL based)
  // This gives us Zotero-quality metadata when possible
  try {
    if (typeof extractMetadataHybrid !== 'undefined') {
      console.log('[Enrich] Trying hybrid extraction first');
      const hybridMetadata = await extractMetadataHybrid(source);
      
      if (hybridMetadata && hybridMetadata.confidence >= 90) {
        console.log('[Enrich] Hybrid extraction successful:', hybridMetadata.enrichmentSource);
        return hybridMetadata;
      }
    }
  } catch (error) {
    console.log('[Enrich] Hybrid extraction failed, using original logic');
  }
  
  // ORIGINAL: Fallback to existing enrichment logic
  const type = detectSourceType(source);
  
  console.log(`Enriching ${source.title.substring(0, 50)} as type: ${type}`);
  
  switch (type) {
    case 'academic':
      return await enrichAcademic(source);
    case 'arxiv':
      return await enrichArxiv(source);
    case 'web':
      return await enrichWeb(source);
    case 'youtube':
      return await enrichYoutube(source);
    default:
      return { ...source, confidence: 0, enrichmentType: 'none' };
  }
}

/**
 * Detect source type
 */
function detectSourceType(source) {
  const title = source.title.toLowerCase();
  const url = source.url?.toLowerCase() || '';
  
  // YouTube
  if (title.includes('youtube') || url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  }
  
  // arXiv
  if (title.includes('arxiv') || url.includes('arxiv.org')) {
    return 'arxiv';
  }
  
  // Academic (PDF or academic keywords)
  if (source.type === 'pdf' || 
      title.match(/\.(pdf|docx?)$/i) ||
      title.match(/\d{4}/) || // Has year
      title.includes('et al') ||
      title.includes('journal') ||
      title.includes('conference')) {
    return 'academic';
  }
  
  // Web article (has URL or looks like article title)
  if (url || title.length > 20) {
    return 'web';
  }
  
  return 'unknown';
}

/**
 * Enrich academic paper
 */
async function enrichAcademic(source) {
  // Clean title for search
  const cleanTitle = cleanTitleForSearch(source.title);
  
  // Try to parse author and year from filename
  const parsed = parseFilenameMetadata(source.title);
  
  // Strategy 1: If we have author + year, use structured query
  if (parsed.author && parsed.year) {
    const structuredMetadata = await queryWithAuthorYear(parsed.author, parsed.year, cleanTitle);
    if (structuredMetadata && structuredMetadata.confidence >= 0.7) {
      return { ...source, ...structuredMetadata, enrichmentType: 'structured_query' };
    }
  }
  
  // Strategy 2: Try CrossRef with title
  let metadata = await queryCrossRef(cleanTitle);
  if (metadata && metadata.confidence >= 0.7) {
    return { ...source, ...metadata, enrichmentType: 'crossref' };
  }
  
  // Strategy 3: Try OpenAlex
  metadata = await queryOpenAlex(cleanTitle);
  if (metadata && metadata.confidence >= 0.65) {
    return { ...source, ...metadata, enrichmentType: 'openalex' };
  }
  
  // Strategy 4: Try Semantic Scholar
  metadata = await querySemanticScholar(cleanTitle);
  if (metadata && metadata.confidence >= 0.65) {
    return { ...source, ...metadata, enrichmentType: 'semanticscholar' };
  }
  
  // No good match found
  return { ...source, confidence: 0, enrichmentType: 'none' };
}

/**
 * Parse metadata from filename
 * Handles patterns like:
 * - "Smith et al - 2024 - Title.pdf"
 * - "Jones & Brown (2023) - Title.pdf"
 * - "Author2024Title.pdf"
 */
function parseFilenameMetadata(title) {
  const result = { author: null, year: null };
  
  // Pattern 1: "Author et al - YYYY - Title" or "Author et al. - YYYY - Title"
  const pattern1 = /^([^-]+?)\s+et\s+al\.?\s*[-–—]\s*(\d{4})/i;
  const match1 = title.match(pattern1);
  if (match1) {
    result.author = match1[1].trim();
    result.year = parseInt(match1[2]);
    return result;
  }
  
  // Pattern 2: "Author & Author (YYYY)" or "Author and Author (YYYY)"
  const pattern2 = /^([^(]+?)\s*\((\d{4})\)/;
  const match2 = title.match(pattern2);
  if (match2) {
    result.author = match2[1].replace(/\s+(&|and)\s+.*/, '').trim();
    result.year = parseInt(match2[2]);
    return result;
  }
  
  // Pattern 3: "LastName - YYYY - Title"
  const pattern3 = /^([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\s*[-–—]\s*(\d{4})/;
  const match3 = title.match(pattern3);
  if (match3) {
    result.author = match3[1].trim();
    result.year = parseInt(match3[2]);
    return result;
  }
  
  // Pattern 4: "Author YYYY Title" (no separators)
  const pattern4 = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(\d{4})\s+/;
  const match4 = title.match(pattern4);
  if (match4) {
    result.author = match4[1].trim();
    result.year = parseInt(match4[2]);
    return result;
  }
  
  return result;
}

/**
 * Query CrossRef with structured author + year query
 */
async function queryWithAuthorYear(author, year, title) {
  try {
    // Build structured query
    const authorQuery = encodeURIComponent(author);
    const titleQuery = encodeURIComponent(title);
    const url = `${APIS.crossref}?query.author=${authorQuery}&query.title=${titleQuery}&filter=from-pub-date:${year},until-pub-date:${year}&rows=3`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('CrossRef structured query error');
    
    const data = await response.json();
    
    if (!data.message?.items?.length) {
      return null;
    }
    
    const item = data.message.items[0];
    
    // Higher confidence for structured queries
    const titleConfidence = calculateTitleSimilarity(title, item.title?.[0] || '');
    const yearMatch = item.published?.['date-parts']?.[0]?.[0] === year ? 0.2 : 0;
    const confidence = Math.min(1.0, titleConfidence + yearMatch);
    
    if (confidence < 0.7) return null;
    
    return {
      title: item.title?.[0] || title,
      authors: item.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()) || [],
      doi: item.DOI || null,
      journal: item['container-title']?.[0] || null,
      volume: item.volume || null,
      issue: item.issue || null,
      pages: item.page || null,
      year: item.published?.['date-parts']?.[0]?.[0] || year,
      abstract: item.abstract || null,
      publisher: item.publisher || null,
      issn: item.ISSN?.[0] || null,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : null),
      confidence: confidence
    };
    
  } catch (error) {
    console.error('Structured query error:', error);
    return null;
  }
}

/**
 * Query CrossRef API
 */
async function queryCrossRef(title) {
  try {
    const query = encodeURIComponent(title);
    const url = `${APIS.crossref}?query.title=${query}&rows=3`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('CrossRef API error');
    
    const data = await response.json();
    
    if (!data.message?.items?.length) {
      return null;
    }
    
    // Get best match
    const item = data.message.items[0];
    
    // Calculate confidence based on title similarity
    const confidence = calculateTitleSimilarity(title, item.title?.[0] || '');
    
    // Lowered threshold from 0.8 to 0.7 for better matching
    if (confidence < 0.7) return null;
    
    // Extract metadata
    return {
      title: item.title?.[0] || title,
      authors: item.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()) || [],
      doi: item.DOI || null,
      journal: item['container-title']?.[0] || null,
      volume: item.volume || null,
      issue: item.issue || null,
      pages: item.page || null,
      year: item.published?.['date-parts']?.[0]?.[0] || item.created?.['date-parts']?.[0]?.[0] || null,
      abstract: item.abstract || null,
      publisher: item.publisher || null,
      issn: item.ISSN?.[0] || null,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : null),
      confidence: confidence,
      citations: item['is-referenced-by-count'] || null
    };
    
  } catch (error) {
    console.error('CrossRef error:', error);
    return null;
  }
}

/**
 * Query OpenAlex API
 */
async function queryOpenAlex(title) {
  try {
    const query = encodeURIComponent(title);
    const url = `${APIS.openalex}?search=${query}&per-page=3`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('OpenAlex API error');
    
    const data = await response.json();
    
    if (!data.results?.length) {
      return null;
    }
    
    const item = data.results[0];
    const confidence = calculateTitleSimilarity(title, item.title || '');
    
    // Lowered threshold to 0.65 for better matching
    if (confidence < 0.65) return null;
    
    return {
      title: item.title || title,
      authors: item.authorships?.map(a => a.author?.display_name).filter(Boolean) || [],
      doi: item.doi?.replace('https://doi.org/', '') || null,
      journal: item.primary_location?.source?.display_name || null,
      volume: item.biblio?.volume || null,
      issue: item.biblio?.issue || null,
      pages: item.biblio?.first_page && item.biblio?.last_page 
        ? `${item.biblio.first_page}-${item.biblio.last_page}` 
        : null,
      year: item.publication_year || null,
      abstract: item.abstract_inverted_index ? reconstructAbstract(item.abstract_inverted_index) : null,
      publisher: item.primary_location?.source?.host_organization_name || null,
      url: item.doi || item.primary_location?.landing_page_url || null,
      confidence: confidence,
      citations: item.cited_by_count || null,
      keywords: item.concepts?.slice(0, 5).map(c => c.display_name) || []
    };
    
  } catch (error) {
    console.error('OpenAlex error:', error);
    return null;
  }
}

/**
 * Query Semantic Scholar API
 */
async function querySemanticScholar(title) {
  try {
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const query = encodeURIComponent(title);
    const url = `${APIS.semanticScholar}?query=${query}&limit=3&fields=title,authors,year,abstract,venue,externalIds,citationCount,influentialCitationCount`;
    
    const response = await fetch(url);
    
    // Handle rate limiting gracefully
    if (response.status === 429) {
      console.log('[Semantic Scholar] Rate limited, skipping');
      return null;
    }
    
    if (!response.ok) {
      console.log('[Semantic Scholar] API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.data?.length) {
      return null;
    }
    
    const item = data.data[0];
    const confidence = calculateTitleSimilarity(title, item.title || '');
    
    // Lowered threshold to 0.65 for better matching
    if (confidence < 0.65) return null;
    
    return {
      title: item.title || title,
      authors: item.authors?.map(a => a.name) || [],
      doi: item.externalIds?.DOI || null,
      journal: item.venue || null,
      year: item.year || null,
      abstract: item.abstract || null,
      url: item.externalIds?.DOI ? `https://doi.org/${item.externalIds.DOI}` : null,
      confidence: confidence,
      citations: item.citationCount || null,
      arxivId: item.externalIds?.ArXiv || null
    };
    
  } catch (error) {
    console.log('[Semantic Scholar] Error (non-fatal):', error.message);
    return null;
  }
}

/**
 * Enrich arXiv preprint
 */
async function enrichArxiv(source) {
  try {
    // Extract arXiv ID if present
    const arxivIdMatch = source.title.match(/(\d{4}\.\d{4,5})/);
    let query;
    
    if (arxivIdMatch) {
      query = `id:${arxivIdMatch[1]}`;
    } else {
      const cleanTitle = cleanTitleForSearch(source.title);
      query = `ti:"${encodeURIComponent(cleanTitle)}"`;
    }
    
    const url = `${APIS.arxiv}?search_query=${query}&max_results=3`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('arXiv API error');
    
    const text = await response.text();
    
    // Parse XML response
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    
    const entries = xml.querySelectorAll('entry');
    if (!entries.length) return { ...source, confidence: 0 };
    
    const entry = entries[0];
    
    // Extract metadata
    const arxivTitle = entry.querySelector('title')?.textContent?.trim() || '';
    const confidence = calculateTitleSimilarity(cleanTitleForSearch(source.title), arxivTitle);
    
    const authors = Array.from(entry.querySelectorAll('author name')).map(el => el.textContent.trim());
    const abstract = entry.querySelector('summary')?.textContent?.trim() || null;
    const published = entry.querySelector('published')?.textContent?.trim() || null;
    const arxivId = entry.querySelector('id')?.textContent?.match(/(\d{4}\.\d{4,5})/)?.[1] || null;
    const categories = Array.from(entry.querySelectorAll('category')).map(el => el.getAttribute('term'));
    
    return {
      ...source,
      title: arxivTitle || source.title,
      authors: authors,
      year: published ? new Date(published).getFullYear() : null,
      abstract: abstract,
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : source.url,
      arxivId: arxivId,
      categories: categories,
      publisher: 'arXiv',
      confidence: confidence,
      enrichmentType: 'arxiv'
    };
    
  } catch (error) {
    console.error('arXiv error:', error);
    return { ...source, confidence: 0 };
  }
}

/**
 * Enrich web article
 */
async function enrichWeb(source) {
  if (!source.url) {
    return { ...source, confidence: 0 };
  }
  
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error('Failed to fetch URL');
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract Open Graph metadata
    const getMetaContent = (property) => {
      const meta = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
      return meta?.getAttribute('content') || null;
    };
    
    const title = getMetaContent('og:title') || 
                  getMetaContent('twitter:title') || 
                  doc.querySelector('title')?.textContent || 
                  source.title;
    
    const description = getMetaContent('og:description') || 
                       getMetaContent('twitter:description') || 
                       getMetaContent('description') || 
                       null;
    
    const siteName = getMetaContent('og:site_name') || 
                    getMetaContent('twitter:site') || 
                    new URL(source.url).hostname;
    
    const author = getMetaContent('author') || 
                  getMetaContent('article:author') || 
                  null;
    
    const publishDate = getMetaContent('article:published_time') || 
                       getMetaContent('datePublished') || 
                       null;
    
    return {
      ...source,
      title: title,
      authors: author ? [author] : [],
      abstract: description,
      publisher: siteName,
      year: publishDate ? new Date(publishDate).getFullYear() : null,
      date: publishDate,
      url: source.url,
      confidence: 0.7, // Medium confidence for web scraping
      enrichmentType: 'web'
    };
    
  } catch (error) {
    console.error('Web enrichment error:', error);
    return { ...source, confidence: 0 };
  }
}

/**
 * Enrich YouTube video
 * Note: Requires YouTube API key from user
 */
async function enrichYoutube(source) {
  // Extract video ID
  const videoId = extractYoutubeId(source.url || source.title);
  if (!videoId) {
    return { ...source, confidence: 0 };
  }
  
  // Check if API key is configured
  const apiKey = localStorage.getItem('youtube_api_key');
  if (!apiKey) {
    console.warn('YouTube API key not configured');
    return {
      ...source,
      url: `https://youtube.com/watch?v=${videoId}`,
      confidence: 0.3,
      enrichmentType: 'youtube_nokey'
    };
  }
  
  try {
    const url = `${APIS.youtube}?id=${videoId}&key=${apiKey}&part=snippet,contentDetails,statistics`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('YouTube API error');
    
    const data = await response.json();
    
    if (!data.items?.length) {
      return { ...source, confidence: 0 };
    }
    
    const video = data.items[0];
    const snippet = video.snippet;
    const details = video.contentDetails;
    
    return {
      ...source,
      title: snippet.title || source.title,
      authors: [snippet.channelTitle],
      abstract: snippet.description,
      publisher: 'YouTube',
      year: new Date(snippet.publishedAt).getFullYear(),
      date: snippet.publishedAt,
      url: `https://youtube.com/watch?v=${videoId}`,
      duration: details.duration,
      tags: snippet.tags || [],
      confidence: 0.95,
      enrichmentType: 'youtube'
    };
    
  } catch (error) {
    console.error('YouTube error:', error);
    return { ...source, confidence: 0 };
  }
}

/**
 * Helper: Clean title for search
 */
function cleanTitleForSearch(title) {
  return title
    .replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, '') // Remove extensions
    .replace(/["']/g, '') // Remove quotes
    .replace(/\s*-\s*(arXiv|ResearchGate|YouTube).*$/i, '') // Remove platform suffixes
    .replace(/\s+et\s+al\.?\s*/i, ' ') // Simplify "et al"
    .replace(/\s*\d{4}\s*-\s*/g, ' ') // Remove standalone years
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Helper: Calculate title similarity (0-1)
 */
function calculateTitleSimilarity(title1, title2) {
  const clean1 = title1.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const clean2 = title2.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  
  // Exact match
  if (clean1 === clean2) return 1.0;
  
  // Word overlap
  const words1 = new Set(clean1.split(/\s+/));
  const words2 = new Set(clean2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  const jaccard = intersection.size / union.size;
  
  // Substring match bonus
  const substring = clean1.includes(clean2) || clean2.includes(clean1) ? 0.2 : 0;
  
  return Math.min(1.0, jaccard + substring);
}

/**
 * Helper: Reconstruct abstract from inverted index
 */
function reconstructAbstract(invertedIndex) {
  try {
    const words = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
      positions.forEach(pos => {
        words[pos] = word;
      });
    }
    return words.filter(Boolean).join(' ').substring(0, 1000);
  } catch {
    return null;
  }
}

/**
 * Helper: Extract YouTube video ID
 */
function extractYoutubeId(text) {
  if (!text) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Just the ID
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

/**
 * Helper: Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for use in popup.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { enrichSources };
}
