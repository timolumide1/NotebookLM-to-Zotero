// Content Script - Runs on notebooklm.google.com
// Listens for messages from popup and extracts source data

console.log('NotebookLM to Zotero: Content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractSources') {
    // Use async handler
    handleExtractSources(sendResponse);
    return true; // Keep message channel open for async response
  }
  return false;
});

// Async handler for source extraction
async function handleExtractSources(sendResponse) {
  try {
    const result = extractSourcesFromPage();
    
    // Try to extract conversation history if available
    try {
      result.conversations = await extractConversations();
    } catch (error) {
      console.log('Could not extract conversations:', error);
      result.conversations = [];
    }
    
    sendResponse(result);
  } catch (error) {
    console.error('Error extracting sources:', error);
    sendResponse({
      error: 'Failed to extract sources from page. Make sure you are on a NotebookLM notebook.',
      sources: [],
      notebookName: ''
    });
  }
}

// Extract sources from NotebookLM page
function extractSourcesFromPage() {
  const sources = [];
  let notebookName = 'Untitled Notebook';
  
  try {
    // Try to get notebook name
    notebookName = getNotebookName();
    
    // Extract sources using multiple selector strategies
    const sourceElements = findSourceElements();
    
    console.log(`Found ${sourceElements.length} source elements`);
    
    sourceElements.forEach((element, index) => {
      try {
        const source = extractSourceData(element, index);
        if (source && source.title) {
          sources.push(source);
        }
      } catch (error) {
        console.error('Error extracting source data:', error);
      }
    });
    
  } catch (error) {
    console.error('Error in extractSourcesFromPage:', error);
  }
  
  return {
    sources: sources,
    notebookName: notebookName,
    error: sources.length === 0 ? 'No sources found in this notebook.' : null
  };
}

// Get notebook name from page
function getNotebookName() {
  // Try multiple selectors for notebook name
  const selectors = [
    '[data-notebook-title]',
    '.notebook-title',
    '[aria-label*="otebook"]',
    'h1',
    '[role="heading"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      const name = element.textContent.trim();
      // Avoid generic headers
      if (name && name.length > 0 && !name.toLowerCase().includes('notebooklm')) {
        return name;
      }
    }
  }
  
  // Try to get from document title
  const title = document.title;
  if (title && !title.toLowerCase().includes('notebooklm')) {
    return title.split('|')[0].trim();
  }
  
  return 'NotebookLM Export';
}

// Find source elements on page
function findSourceElements() {
  // NotebookLM uses specific patterns - let's be more precise
  
  const strategies = [
    // Strategy 1: NotebookLM-specific - single-source-container class
    () => Array.from(document.querySelectorAll('.single-source-container')),
    
    // Strategy 2: Look for source list items (most reliable for NotebookLM)
    () => {
      // NotebookLM typically has sources in a list structure
      const sourceContainers = document.querySelectorAll('[role="list"], [class*="source"], ul');
      for (const container of sourceContainers) {
        const items = Array.from(container.querySelectorAll('[role="listitem"], li, [class*="source-container"], .single-source-container'));
        if (items.length > 0) {
          console.log(`Found ${items.length} sources in list container`);
          return items;
        }
      }
      return [];
    },
    
    // Strategy 3: Look for elements with data attributes
    () => Array.from(document.querySelectorAll('[data-source-id], [data-source-type], [data-source]')),
    
    // Strategy 4: Look in sidebar/panel by ARIA labels
    () => {
      const sourcePanel = document.querySelector('[aria-label*="ource"], [aria-label*="Source"]');
      if (sourcePanel) {
        const items = Array.from(sourcePanel.querySelectorAll('[role="listitem"], [class*="item"], div[class*="source"], .single-source-container'));
        if (items.length > 0) return items;
      }
      return [];
    },
    
    // Strategy 5: Look for interactive elements that seem like sources
    () => {
      // Find elements that are clickable and have source-like content
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, [class*="card"], [class*="source"]'));
      return candidates.filter(el => {
        const text = el.textContent?.trim() || '';
        const hasTitle = text.length > 5 && text.length < 300;
        const hasIcon = el.querySelector('svg, img, [class*="icon"]');
        const isInteractive = el.hasAttribute('tabindex') || el.tagName === 'BUTTON' || el.tagName === 'A';
        const hasSourceClass = el.className.includes('source');
        return (hasTitle && (hasIcon || isInteractive)) || hasSourceClass;
      });
    }
  ];
  
  // Try each strategy
  for (let i = 0; i < strategies.length; i++) {
    const elements = strategies[i]();
    if (elements && elements.length > 0) {
      console.log(`Strategy ${i + 1} found ${elements.length} elements`);
      return elements;
    }
  }
  
  console.warn('No sources found with any strategy');
  return [];
}

// Extract data from a source element
function extractSourceData(element, index) {
  const source = {
    title: '',
    url: '',
    type: 'unknown',
    date: null,
    index: index
  };
  
  // Extract title
  source.title = extractTitle(element);
  
  // Extract URL
  source.url = extractURL(element);
  
  // Determine source type
  source.type = determineSourceType(element, source.url);
  
  // Extract date if available
  source.date = extractDate(element);
  
  return source;
}

// Extract title from element
function extractTitle(element) {
  // Helper function to check if text is a UI element
  function isUIElement(text) {
    if (!text) return true;
    const lower = text.toLowerCase().trim();
    // Filter out UI element text
    if (lower.includes('more_vert')) return true;
    if (lower.includes('markdown')) return true;
    if (lower === 'flex') return true;
    if (lower.length < 5) return true;
    if (lower.match(/^(icon|button|menu|close|open)$/i)) return true;
    return false;
  }
  
  // Helper to clean title
  function cleanTitle(title) {
    if (!title) return '';
    // Remove file extensions
    title = title.replace(/\.(pdf|docx?|xlsx?|pptx?|txt)$/i, '');
    // Remove surrounding quotes
    title = title.replace(/^["']|["']$/g, '');
    // Clean whitespace
    title = title.replace(/\s+/g, ' ').trim();
    return title;
  }
  
  // Strategy 1: NotebookLM-specific - Try aria-label on source-title element
  const sourceTitleEl = element.querySelector('.source-title, .mat-mdc-tooltip-trigger.source-title');
  if (sourceTitleEl) {
    const ariaLabel = sourceTitleEl.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim() && !isUIElement(ariaLabel)) {
      const cleaned = cleanTitle(ariaLabel.trim());
      if (cleaned.length > 5) {
        console.log('✓ Title from aria-label:', cleaned.substring(0, 60));
        return cleaned;
      }
    }
  }
  
  // Strategy 2: Look for span with longest meaningful text inside source-title
  if (sourceTitleEl) {
    const spans = sourceTitleEl.querySelectorAll('span');
    let longestText = '';
    
    for (const span of spans) {
      const text = span.textContent.trim();
      if (!isUIElement(text) && text.length > longestText.length && text.length < 500) {
        longestText = text;
      }
    }
    
    if (longestText.length > 5) {
      const cleaned = cleanTitle(longestText);
      console.log('✓ Title from span:', cleaned.substring(0, 60));
      return cleaned;
    }
  }
  
  // Strategy 3: Look in source-title-column
  const titleColumn = element.querySelector('.source-title-column');
  if (titleColumn) {
    const spans = titleColumn.querySelectorAll('span');
    let longestText = '';
    
    for (const span of spans) {
      const text = span.textContent.trim();
      if (!isUIElement(text) && text.length > longestText.length && text.length < 500) {
        longestText = text;
      }
    }
    
    if (longestText.length > 5) {
      const cleaned = cleanTitle(longestText);
      console.log('✓ Title from title-column:', cleaned.substring(0, 60));
      return cleaned;
    }
  }
  
  // Strategy 4: Try all data attributes
  const dataTitle = element.getAttribute('data-title') || 
                   element.getAttribute('aria-label') ||
                   element.getAttribute('title');
  if (dataTitle && !isUIElement(dataTitle)) {
    const cleaned = cleanTitle(dataTitle.trim());
    if (cleaned.length > 5) {
      console.log('✓ Title from data attr:', cleaned.substring(0, 60));
      return cleaned;
    }
  }
  
  // Strategy 5: Look for ANY span with meaningful text (excluding UI elements)
  const allSpans = element.querySelectorAll('span');
  let candidates = [];
  
  for (const span of allSpans) {
    const text = span.textContent.trim();
    // Must be long enough, not too long, and not a UI element
    if (text.length > 10 && text.length < 300 && !isUIElement(text)) {
      // Prefer spans that don't have many child elements
      if (span.children.length === 0) {
        candidates.push({ text, length: text.length });
      }
    }
  }
  
  // Sort by length and take the longest
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.length - a.length);
    const cleaned = cleanTitle(candidates[0].text);
    console.log('✓ Title from best candidate:', cleaned.substring(0, 60));
    return cleaned;
  }
  
  // Strategy 6: Try common title selectors (fallback)
  const titleSelectors = [
    '.title',
    '.source-title',
    '.name',
    'h2', 'h3', 'h4',
    '[class*="title"]',
    '[class*="name"]'
  ];
  
  for (const selector of titleSelectors) {
    const titleEl = element.querySelector(selector);
    if (titleEl && titleEl.textContent.trim()) {
      const text = titleEl.textContent.trim();
      if (!isUIElement(text)) {
        const cleaned = cleanTitle(text);
        if (cleaned.length > 5) {
          console.log('✓ Title from selector:', cleaned.substring(0, 60));
          return cleaned;
        }
      }
    }
  }
  
  // Strategy 7: Last resort - element text content but be very careful
  const text = element.textContent.trim();
  if (text.length > 10 && text.length < 300 && !isUIElement(text)) {
    const cleaned = cleanTitle(text.replace(/\s+/g, ' ').substring(0, 200));
    if (cleaned.length > 5) {
      console.log('⚠ Title from element text (last resort):', cleaned.substring(0, 60));
      return cleaned;
    }
  }
  
  console.warn('❌ Could not find title, using fallback');
  return `Source ${element.index || ''}`;
}

// Extract URL from element
function extractURL(element) {
  // Try data attributes
  const dataUrl = element.getAttribute('data-url') || 
                 element.getAttribute('data-href') ||
                 element.getAttribute('data-link');
  if (dataUrl) return dataUrl;
  
  // Try href attribute
  const href = element.getAttribute('href');
  if (href && href.startsWith('http')) {
    return href;
  }
  
  // Look for link elements inside
  const link = element.querySelector('a[href]');
  if (link) {
    const linkHref = link.getAttribute('href');
    if (linkHref && linkHref.startsWith('http')) {
      return linkHref;
    }
  }
  
  // Try to find URL in text content (basic extraction)
  const text = element.textContent;
  const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  return '';
}

// Determine source type
function determineSourceType(element, url) {
  // First, check the title for file extension
  const titleEl = element.querySelector('.source-title, .mat-mdc-tooltip-trigger.source-title');
  if (titleEl) {
    const ariaLabel = titleEl.getAttribute('aria-label') || '';
    const titleText = titleEl.textContent || '';
    const titleToCheck = (ariaLabel + ' ' + titleText).toLowerCase();
    
    // Check for academic web sources first (ResearchGate, arXiv, DOI, etc.)
    if (titleToCheck.includes('researchgate')) {
      return 'web'; // Academic paper from ResearchGate
    }
    if (titleToCheck.includes('arxiv')) {
      return 'web'; // Preprint from arXiv
    }
    if (titleToCheck.includes('doi.org') || titleToCheck.includes('doi:')) {
      return 'web'; // DOI link
    }
    if (titleToCheck.includes('pubmed') || titleToCheck.includes('ncbi.nlm.nih')) {
      return 'web'; // PubMed/NCBI
    }
    if (titleToCheck.includes('scholar.google')) {
      return 'web'; // Google Scholar
    }
    if (titleToCheck.includes('jstor')) {
      return 'web'; // JSTOR
    }
    
    // Check for file extensions in title
    if (titleToCheck.match(/\.pdf$/i) || titleToCheck.includes('.pdf"') || titleToCheck.includes('.pdf ')) {
      return 'pdf';
    }
    if (titleToCheck.match(/\.(docx?|doc)$/i)) {
      return 'doc';
    }
    if (titleToCheck.match(/\.(xlsx?|xls)$/i)) {
      return 'doc';
    }
    if (titleToCheck.match(/\.(pptx?|ppt)$/i)) {
      return 'doc';
    }
  }
  
  // Check data attribute
  const dataType = element.getAttribute('data-source-type') || 
                  element.getAttribute('data-type') ||
                  element.getAttribute('type');
  if (dataType) {
    const normalized = dataType.toLowerCase();
    if (normalized.includes('web')) return 'web';
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.includes('video') || normalized.includes('youtube')) return 'youtube';
    if (normalized.includes('drive')) return 'drive';
    if (normalized.includes('doc')) return 'doc';
  }
  
  // Check aria-label
  const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
  if (ariaLabel.includes('pdf')) return 'pdf';
  if (ariaLabel.includes('youtube') || ariaLabel.includes('video')) return 'youtube';
  if (ariaLabel.includes('drive')) return 'drive';
  if (ariaLabel.includes('document') || ariaLabel.includes('doc')) return 'doc';
  if (ariaLabel.includes('web') || ariaLabel.includes('link') || ariaLabel.includes('http')) return 'web';
  
  // Check by URL patterns
  if (url) {
    const urlLower = url.toLowerCase();
    
    // Academic sources
    if (urlLower.includes('researchgate.net')) return 'web';
    if (urlLower.includes('arxiv.org')) return 'web';
    if (urlLower.includes('doi.org')) return 'web';
    if (urlLower.includes('pubmed') || urlLower.includes('ncbi.nlm.nih')) return 'web';
    if (urlLower.includes('scholar.google')) return 'web';
    if (urlLower.includes('jstor.org')) return 'web';
    
    // Video sources
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return 'youtube';
    }
    if (urlLower.includes('vimeo.com')) return 'youtube';
    
    // Google services
    if (urlLower.includes('drive.google.com') || urlLower.includes('docs.google.com/file')) {
      return 'drive';
    }
    if (urlLower.includes('docs.google.com/document') || urlLower.includes('docs.google.com/spreadsheets')) {
      return 'doc';
    }
    
    // PDF files
    if (urlLower.endsWith('.pdf') || urlLower.includes('/pdf/') || urlLower.includes('.pdf?')) {
      return 'pdf';
    }
    
    // If it has any URL, likely a web source
    if (urlLower.startsWith('http')) {
      return 'web';
    }
  }
  
  // Check text content for clues
  const textContent = element.textContent?.toLowerCase() || '';
  if (textContent.includes('.pdf')) return 'pdf';
  if (textContent.includes('youtube')) return 'youtube';
  if (textContent.includes('google drive')) return 'drive';
  if (textContent.includes('researchgate')) return 'web';
  if (textContent.includes('arxiv')) return 'web';
  
  // Check by icon or class names (NotebookLM uses icons for source types)
  const classList = element.className?.toLowerCase() || '';
  const htmlContent = element.innerHTML?.toLowerCase() || '';
  
  if (classList.includes('pdf') || htmlContent.includes('picture_as_pdf') || htmlContent.includes('pdf')) return 'pdf';
  if (classList.includes('youtube') || classList.includes('video') || htmlContent.includes('play_circle') || htmlContent.includes('videocam')) return 'youtube';
  if (classList.includes('drive') || htmlContent.includes('folder') || htmlContent.includes('drive')) return 'drive';
  if (classList.includes('doc') || htmlContent.includes('description') || htmlContent.includes('document')) return 'doc';
  if (classList.includes('web') || classList.includes('link') || htmlContent.includes('link') || htmlContent.includes('language')) return 'web';
  
  // Check for Material Icons (NotebookLM uses these)
  const icon = element.querySelector('[class*="icon"], svg, mat-icon, .material-icons');
  if (icon) {
    const iconText = icon.textContent?.toLowerCase() || '';
    const iconClass = icon.className?.toLowerCase() || '';
    
    if (iconText.includes('pdf') || iconClass.includes('pdf')) return 'pdf';
    if (iconText.includes('play') || iconText.includes('video') || iconClass.includes('video')) return 'youtube';
    if (iconText.includes('folder') || iconText.includes('drive') || iconClass.includes('drive')) return 'drive';
    if (iconText.includes('description') || iconText.includes('doc') || iconClass.includes('doc')) return 'doc';
    if (iconText.includes('link') || iconText.includes('language') || iconClass.includes('web')) return 'web';
  }
  
  // If we have a URL but couldn't categorize, default to web
  if (url && url.startsWith('http')) {
    return 'web';
  }
  
  // Last resort: if element looks like it has meaningful content, guess based on structure
  const hasUrl = !!url;
  const hasLongTitle = (element.textContent?.length || 0) > 20;
  
  if (hasUrl && hasLongTitle) return 'web';
  if (hasLongTitle) return 'web'; // Changed from 'doc' - more likely web article
  
  return 'unknown';
}

// Extract date from element
function extractDate(element) {
  const dateAttr = element.getAttribute('data-date') || 
                  element.getAttribute('data-created') ||
                  element.getAttribute('datetime');
  if (dateAttr) return dateAttr;
  
  // Look for date elements
  const dateEl = element.querySelector('time, [class*="date"], [class*="time"]');
  if (dateEl) {
    const datetime = dateEl.getAttribute('datetime');
    if (datetime) return datetime;
    
    const dateText = dateEl.textContent.trim();
    if (dateText) return dateText;
  }
  
  return null;
}

// Helper: Wait for element to appear
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Element not found'));
    }, timeout);
  });
}

/**
 * Extract NotebookLM conversation history
 * Captures chat messages for research context
 */
async function extractConversations() {
  const conversations = [];
  
  try {
    console.log('[Conversations] Starting extraction...');
    
    // Wait a bit for chat to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Find chat container
    const chatContainer = document.querySelector('.chat-panel-content');
    
    if (!chatContainer) {
      console.log('[Conversations] No chat panel found');
      return conversations;
    }
    
    // Find all message pairs
    const messagePairs = chatContainer.querySelectorAll('.chat-message-pair');
    
    if (messagePairs.length === 0) {
      console.log('[Conversations] No message pairs found');
      return conversations;
    }
    
    console.log(`[Conversations] Found ${messagePairs.length} message pairs`);
    
    // Extract each message pair (contains user question + AI response)
    messagePairs.forEach((pair, pairIndex) => {
      try {
        // Extract user message
        const userMessage = pair.querySelector('.from-user-message-card-content .message-text-content');
        if (userMessage) {
          const userText = userMessage.textContent?.trim();
          if (userText && userText.length > 0) {
            conversations.push({
              index: conversations.length + 1,
              role: 'user',
              content: userText,
              timestamp: new Date().toISOString()
            });
            console.log(`[Conversations] User message ${pairIndex + 1}: ${userText.substring(0, 50)}...`);
          }
        }
        
        // Extract AI response
        const aiMessage = pair.querySelector('.to-user-message-card-content .message-text-content');
        if (aiMessage) {
          const aiText = aiMessage.textContent?.trim();
          if (aiText && aiText.length > 0) {
            conversations.push({
              index: conversations.length + 1,
              role: 'assistant',
              content: aiText,
              timestamp: new Date().toISOString()
            });
            console.log(`[Conversations] AI message ${pairIndex + 1}: ${aiText.substring(0, 50)}...`);
          }
        }
      } catch (error) {
        console.log(`[Conversations] Error parsing message pair ${pairIndex}:`, error);
      }
    });
    
    console.log(`[Conversations] Successfully extracted ${conversations.length} total messages`);
    
  } catch (error) {
    console.error('[Conversations] Error extracting conversations:', error);
  }
  
  return conversations;
}
