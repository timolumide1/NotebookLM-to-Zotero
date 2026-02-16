/**
 * Enhanced Metadata Extractor - Zotero-style approach
 * Uses DOI and URL-based metadata extraction like Zotero does
 */

// DOI regex patterns
const DOI_PATTERNS = {
  standard: /\b(10\.\d{4,}\/[^\s]+)/gi,
  url: /doi\.org\/(10\.\d{4,}\/[^\s]+)/gi,
  embedded: /doi[:\s]+(10\.\d{4,}\/[^\s]+)/gi
};

// Known source URL patterns
const SOURCE_PATTERNS = {
  arxiv: /arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/i,
  pubmed: /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i,
  doi: /doi\.org\/(10\.\d{4,}\/[^\s]+)/i,
  semanticScholar: /semanticscholar\.org\/paper\/([a-f0-9]+)/i,
  googleScholar: /scholar\.google\.com/i,
  jstor: /jstor\.org\/stable\/(\d+)/i,
  springer: /link\.springer\.com\/(?:article|chapter)\/(10\.\d{4,}\/[^\s]+)/i,
  wiley: /onlinelibrary\.wiley\.com\/doi\/(?:abs|full)\/(10\.\d{4,}\/[^\s]+)/i,
  scienceDirect: /sciencedirect\.com\/science\/article\/(?:pii|abs)\/([A-Z0-9]+)/i,
  nature: /nature\.com\/articles\/([a-z0-9-]+)/i,
  ieee: /ieeexplore\.ieee\.org\/document\/(\d+)/i,
  acm: /dl\.acm\.org\/doi\/(?:abs|full)\/(10\.\d{4,}\/[^\s]+)/i,
  plos: /journals\.plos\.org\/plosone\/article\?id=(10\.\d{4,}\/[^\s]+)/i
};

/**
 * Extract DOI from various sources
 */
function extractDOI(source) {
  console.log('[DOI Extract] Checking source:', source.title);
  
  // 1. Check filename for DOI
  if (source.title) {
    for (const [type, pattern] of Object.entries(DOI_PATTERNS)) {
      const match = source.title.match(pattern);
      if (match) {
        const doi = type === 'standard' ? match[0] : match[1];
        console.log('[DOI Extract] Found in title:', doi);
        return cleanDOI(doi);
      }
    }
  }
  
  // 2. Check URL for DOI
  if (source.url) {
    // Direct DOI URL
    const doiMatch = source.url.match(SOURCE_PATTERNS.doi);
    if (doiMatch) {
      console.log('[DOI Extract] Found in URL:', doiMatch[1]);
      return cleanDOI(doiMatch[1]);
    }
    
    // Check URL content for embedded DOI
    const urlDoi = source.url.match(DOI_PATTERNS.standard);
    if (urlDoi) {
      console.log('[DOI Extract] Found embedded in URL:', urlDoi[0]);
      return cleanDOI(urlDoi[0]);
    }
  }
  
  console.log('[DOI Extract] No DOI found');
  return null;
}

/**
 * Clean and normalize DOI
 */
function cleanDOI(doi) {
  return doi
    .replace(/^doi:?\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .trim();
}

/**
 * Get full metadata from CrossRef using DOI
 * This is how Zotero does it!
 */
async function getMetadataFromDOI(doi) {
  console.log('[CrossRef] Fetching metadata for DOI:', doi);
  
  try {
    // Use CrossRef's content negotiation API
    // This is exactly what Zotero uses
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log('[CrossRef] Failed to fetch:', response.status);
      return null;
    }
    
    const data = await response.json();
    const work = data.message;
    
    console.log('[CrossRef] Got metadata:', work.title?.[0]);
    
    // Convert CrossRef format to our format
    return {
      title: work.title?.[0] || '',
      authors: work.author?.map(a => {
        if (a.given && a.family) {
          return `${a.given} ${a.family}`;
        }
        return a.family || a.name || '';
      }) || [],
      doi: work.DOI,
      abstract: work.abstract || '',
      year: work.published?.['date-parts']?.[0]?.[0] || 
            work.created?.['date-parts']?.[0]?.[0] || '',
      journal: work['container-title']?.[0] || '',
      volume: work.volume || '',
      issue: work.issue || '',
      pages: work.page || '',
      publisher: work.publisher || '',
      issn: work.ISSN?.[0] || '',
      url: work.URL || `https://doi.org/${work.DOI}`,
      type: work.type || 'journal-article',
      confidence: 100, // CrossRef data is authoritative
      enrichmentSource: 'CrossRef (DOI)',
      date: formatCrossRefDate(work.published || work.created)
    };
  } catch (error) {
    console.error('[CrossRef] Error fetching DOI metadata:', error);
    return null;
  }
}

/**
 * Format CrossRef date to standard format
 */
function formatCrossRefDate(dateObj) {
  if (!dateObj || !dateObj['date-parts'] || !dateObj['date-parts'][0]) {
    return '';
  }
  
  const [year, month, day] = dateObj['date-parts'][0];
  if (month && day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  return String(year);
}

/**
 * Extract metadata from arXiv URL
 */
async function getMetadataFromArxiv(arxivId) {
  console.log('[arXiv] Fetching metadata for:', arxivId);
  
  try {
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
    const text = await response.text();
    
    // Parse XML response
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    
    const entry = xml.querySelector('entry');
    if (!entry) {
      console.log('[arXiv] No entry found');
      return null;
    }
    
    const title = entry.querySelector('title')?.textContent?.trim() || '';
    const summary = entry.querySelector('summary')?.textContent?.trim() || '';
    const published = entry.querySelector('published')?.textContent?.trim() || '';
    
    const authors = Array.from(entry.querySelectorAll('author name')).map(
      name => name.textContent?.trim() || ''
    );
    
    // Extract DOI from entry if available
    const doiLink = Array.from(entry.querySelectorAll('link')).find(
      link => link.getAttribute('title') === 'doi'
    );
    const doi = doiLink?.getAttribute('href')?.replace('http://dx.doi.org/', '') || '';
    
    console.log('[arXiv] Got metadata:', title);
    
    return {
      title,
      authors,
      abstract: summary,
      year: published ? new Date(published).getFullYear() : '',
      date: published ? published.split('T')[0] : '',
      doi: doi,
      url: `https://arxiv.org/abs/${arxivId}`,
      arxivId: arxivId,
      publisher: 'arXiv',
      confidence: 95,
      enrichmentSource: 'arXiv API'
    };
  } catch (error) {
    console.error('[arXiv] Error fetching metadata:', error);
    return null;
  }
}

/**
 * Extract metadata from PubMed URL
 */
async function getMetadataFromPubMed(pmid) {
  console.log('[PubMed] Fetching metadata for PMID:', pmid);
  
  try {
    // Use PubMed E-utilities API
    const response = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`
    );
    
    const data = await response.json();
    const article = data.result?.[pmid];
    
    if (!article) {
      console.log('[PubMed] No article found');
      return null;
    }
    
    console.log('[PubMed] Got metadata:', article.title);
    
    return {
      title: article.title || '',
      authors: article.authors?.map(a => a.name || '') || [],
      abstract: '', // Need separate call for abstract
      year: article.pubdate ? new Date(article.pubdate).getFullYear() : '',
      journal: article.fulljournalname || article.source || '',
      volume: article.volume || '',
      issue: article.issue || '',
      pages: article.pages || '',
      doi: article.elocationid?.replace('doi: ', '') || '',
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      pmid: pmid,
      confidence: 95,
      enrichmentSource: 'PubMed API'
    };
  } catch (error) {
    console.error('[PubMed] Error fetching metadata:', error);
    return null;
  }
}

/**
 * Extract metadata from URL using source-specific handlers
 */
async function getMetadataFromURL(url) {
  console.log('[URL Extract] Processing URL:', url);
  
  // Check for arXiv
  const arxivMatch = url.match(SOURCE_PATTERNS.arxiv);
  if (arxivMatch) {
    console.log('[URL Extract] Detected arXiv');
    return await getMetadataFromArxiv(arxivMatch[1]);
  }
  
  // Check for PubMed
  const pubmedMatch = url.match(SOURCE_PATTERNS.pubmed);
  if (pubmedMatch) {
    console.log('[URL Extract] Detected PubMed');
    return await getMetadataFromPubMed(pubmedMatch[1]);
  }
  
  // Check for DOI in URL
  const doiMatch = url.match(SOURCE_PATTERNS.doi);
  if (doiMatch) {
    console.log('[URL Extract] Detected DOI in URL');
    return await getMetadataFromDOI(doiMatch[1]);
  }
  
  // Check publisher URLs that contain DOI
  const publisherPatterns = [
    SOURCE_PATTERNS.springer,
    SOURCE_PATTERNS.wiley,
    SOURCE_PATTERNS.acm,
    SOURCE_PATTERNS.plos
  ];
  
  for (const pattern of publisherPatterns) {
    const match = url.match(pattern);
    if (match) {
      const doi = match[1];
      console.log('[URL Extract] Extracted DOI from publisher URL:', doi);
      return await getMetadataFromDOI(doi);
    }
  }
  
  // Try to extract any DOI pattern from the URL
  const embeddedDoi = url.match(/10\.\d{4,}\/[^\s&?]+/);
  if (embeddedDoi) {
    console.log('[URL Extract] Found embedded DOI in URL:', embeddedDoi[0]);
    return await getMetadataFromDOI(embeddedDoi[0]);
  }
  
  console.log('[URL Extract] No known pattern matched');
  return null;
}

/**
 * Try to find DOI by searching CrossRef with the title
 * This is how Zotero finds DOIs for papers without explicit DOI
 */
async function findDOIByTitle(title) {
  console.log('[DOI Search] Searching CrossRef for title:', title.substring(0, 60));
  
  try {
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const query = encodeURIComponent(title);
    const response = await fetch(
      `https://api.crossref.org/works?query.title=${query}&rows=1&select=DOI,title,score`
    );
    
    if (!response.ok) {
      console.log('[DOI Search] CrossRef search failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    const items = data.message?.items || [];
    
    if (items.length === 0) {
      console.log('[DOI Search] No results found');
      return null;
    }
    
    const firstResult = items[0];
    const score = firstResult.score || 0;
    
    // Lower threshold - CrossRef scores of 30-40 are actually quite good
    // Scores range from 0-100, with 30+ being reasonable matches
    if (score < 30) {
      console.log('[DOI Search] Low confidence match, score:', score);
      return null;
    }
    
    console.log('[DOI Search] ✓ Found DOI:', firstResult.DOI, 'Score:', score);
    return firstResult.DOI;
  } catch (error) {
    console.error('[DOI Search] Error searching CrossRef:', error);
    return null;
  }
}

/**
 * Main hybrid metadata extraction
 * Uses Zotero's approach: DOI first, then URL, then title search, then fallback
 */
async function extractMetadataHybrid(source) {
  console.log('[Hybrid Extract] Starting for:', source.title);
  
  // Step 1: Try DOI from filename/URL (BEST quality)
  let doi = extractDOI(source);
  if (doi) {
    console.log('[Hybrid Extract] Found DOI in source, using CrossRef');
    const metadata = await getMetadataFromDOI(doi);
    if (metadata) {
      return { ...source, ...metadata, hadDOI: true };
    }
  }
  
  // Step 2: Try URL-based extraction (GOOD quality)
  if (source.url) {
    console.log('[Hybrid Extract] Trying URL-based extraction');
    const metadata = await getMetadataFromURL(source.url);
    if (metadata) {
      return { ...source, ...metadata, hadURL: true };
    }
  }
  
  // Step 3: Try finding DOI by title search (MEDIUM quality)
  console.log('[Hybrid Extract] Trying DOI search by title');
  doi = await findDOIByTitle(source.title);
  if (doi) {
    console.log('[Hybrid Extract] Found DOI via title search, using CrossRef');
    const metadata = await getMetadataFromDOI(doi);
    if (metadata) {
      return { ...source, ...metadata, hadDOI: true, foundByTitle: true };
    }
  }
  
  // Step 4: Fallback to original enrichment logic
  console.log('[Hybrid Extract] All hybrid methods failed, will use fallback');
  return null; // Will trigger fallback in caller
}
