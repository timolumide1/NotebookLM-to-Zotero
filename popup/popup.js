// State Management
let currentSources = [];
let notebookName = '';

// UI State
const States = {
  LOADING: 'loading',
  READY: 'ready',
  SUCCESS: 'success',
  ERROR: 'error'
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
  setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  document.getElementById('exportBtn').addEventListener('click', handleExport);
  document.getElementById('exportAgain').addEventListener('click', resetToReady);
  document.getElementById('tryAgain').addEventListener('click', resetToReady);
  
  // Enrichment export button
  const enrichBtn = document.getElementById('enrichExportBtn');
  if (enrichBtn) {
    enrichBtn.addEventListener('click', handleEnrichmentExport);
  }
  
  // Zotero export button
  const zoteroBtn = document.getElementById('zoteroExportBtn');
  if (zoteroBtn) {
    zoteroBtn.addEventListener('click', handleZoteroExport);
  }
  
  // Zotero modal close buttons
  const closeZoteroModal = document.getElementById('closeZoteroModal');
  if (closeZoteroModal) {
    closeZoteroModal.addEventListener('click', () => {
      document.getElementById('zoteroModal').style.display = 'none';
      resetToReady();
    });
  }
  
  const closeZoteroError = document.getElementById('closeZoteroError');
  if (closeZoteroError) {
    closeZoteroError.addEventListener('click', () => {
      document.getElementById('zoteroModal').style.display = 'none';
    });
  }
}

// Initialize Popup
async function initializePopup() {
  try {
    showState(States.LOADING);
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on NotebookLM
    if (!tab.url || !tab.url.includes('notebooklm.google.com')) {
      showError('Please open a NotebookLM notebook to use this extension.');
      return;
    }
    
    // Try to extract sources from the page
    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { action: 'extractSources' });
    } catch (error) {
      // Content script not loaded yet - inject it
      console.log('Content script not responding, injecting...');
      
      try {
        // Inject the content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        });
        
        // Wait a moment for it to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try again
        result = await chrome.tabs.sendMessage(tab.id, { action: 'extractSources' });
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        showError('Please refresh the NotebookLM page and try again.');
        return;
      }
    }
    
    if (result.error) {
      showError(result.error);
      return;
    }
    
    currentSources = result.sources;
    notebookName = result.notebookName;
    
    // Store conversations if available
    if (result.conversations && result.conversations.length > 0) {
      window.notebookConversations = result.conversations;
      console.log(`Captured ${result.conversations.length} conversation messages from NotebookLM`);
    }
    
    // Update UI
    updateNotebookInfo(result.notebookName, result.sources);
    showState(States.READY);
    
    // Enable export button if we have sources
    const exportBtn = document.getElementById('exportBtn');
    const enrichExportBtn = document.getElementById('enrichExportBtn');
    const zoteroExportBtn = document.getElementById('zoteroExportBtn');
    
    console.log('[DEBUG] Button elements found:', {
      exportBtn: !!exportBtn,
      enrichExportBtn: !!enrichExportBtn,
      zoteroExportBtn: !!zoteroExportBtn
    });
    
    if (result.sources.length > 0) {
      exportBtn.disabled = false;
      if (enrichExportBtn) enrichExportBtn.disabled = false;
      
      console.log('[DEBUG] Checking Zotero configuration...');
      
      // Enable Zotero button only if API is configured
      if (zoteroExportBtn) {
        checkZoteroConfig().then(isConfigured => {
          console.log('[DEBUG] Zotero configured:', isConfigured);
          zoteroExportBtn.disabled = !isConfigured;
          console.log('[DEBUG] Zotero button disabled state:', zoteroExportBtn.disabled);
        });
      } else {
        console.warn('[DEBUG] Zotero button element not found!');
      }
    } else {
      exportBtn.disabled = true;
      if (enrichExportBtn) enrichExportBtn.disabled = true;
      if (zoteroExportBtn) zoteroExportBtn.disabled = true;
      showError('This notebook has no sources to export.');
    }
    
  } catch (error) {
    console.error('Initialization error:', error);
    showError('Failed to connect to NotebookLM. Please refresh the page and try again.');
  }
}

// Update Notebook Information
function updateNotebookInfo(name, sources) {
  document.getElementById('notebookName').textContent = name || 'Untitled Notebook';
  document.getElementById('totalCount').textContent = sources.length;
  
  const statsElement = document.getElementById('sourceStats');
  const breakdownElement = document.getElementById('breakdown');
  
  if (sources.length > 0) {
    statsElement.style.display = 'block';
    
    // Count sources by type
    const breakdown = sources.reduce((acc, source) => {
      acc[source.type] = (acc[source.type] || 0) + 1;
      return acc;
    }, {});
    
    // Create breakdown HTML
    const typeLabels = {
      web: '🌐 Web Articles',
      pdf: '📄 PDFs',
      youtube: '📺 YouTube Videos',
      drive: '📁 Google Drive Files',
      doc: '📝 Documents',
      unknown: '❓ Other'
    };
    
    breakdownElement.innerHTML = Object.entries(breakdown)
      .map(([type, count]) => `
        <div class="breakdown-item">
          <span class="type">${typeLabels[type] || typeLabels.unknown}</span>
          <span class="count">${count}</span>
        </div>
      `)
      .join('');
  } else {
    statsElement.style.display = 'none';
  }
}

// Handle Export
async function handleExport() {
  try {
    showState(States.LOADING);
    
    // Generate RIS content
    const risContent = generateRIS(currentSources, notebookName);
    
    // Create filename
    const filename = sanitizeFilename(notebookName || 'NotebookLM_Export') + '_sources.ris';
    
    // Trigger download
    await downloadFile(risContent, filename);
    
    // Show success
    showSuccess(currentSources.length, filename);
    
  } catch (error) {
    console.error('Export error:', error);
    showError('Failed to export sources. Please try again.');
  }
}

// Generate RIS Format
function generateRIS(sources, notebookName) {
  let ris = '';
  const seenTitles = new Set(); // Track to prevent duplicates
  let entryCount = 0;
  
  sources.forEach((source, index) => {
    // Skip if we've already added this source (duplicate detection)
    const normalizedTitle = (source.title || '').trim().toLowerCase();
    if (!normalizedTitle || seenTitles.has(normalizedTitle)) {
      console.log(`Skipping duplicate: ${source.title}`);
      return;
    }
    seenTitles.add(normalizedTitle);
    
    // Determine RIS type based on source type
    let risType = 'GEN'; // Generic default
    switch (source.type) {
      case 'web':
        risType = 'ELEC'; // Electronic source (better than WEB for articles)
        break;
      case 'pdf':
        risType = 'JOUR'; // Journal article (PDFs are often academic papers)
        break;
      case 'youtube':
      case 'video':
        risType = 'VIDEO';
        break;
      case 'doc':
        risType = 'UNPB'; // Unpublished work
        break;
      case 'drive':
        risType = 'GEN';
        break;
      default:
        risType = 'GEN';
    }
    
    // Start entry
    ris += `TY  - ${risType}\n`;
    
    // Title (required field)
    if (source.title) {
      ris += `TI  - ${escapeRIS(source.title)}\n`;
    }
    
    // URL (if available)
    if (source.url && source.url.startsWith('http')) {
      ris += `UR  - ${source.url}\n`;
    }
    
    // Year (extract from date if available, otherwise use current year)
    let year = new Date().getFullYear();
    if (source.date) {
      const parsedYear = new Date(source.date).getFullYear();
      if (!isNaN(parsedYear) && parsedYear > 1900 && parsedYear <= new Date().getFullYear()) {
        year = parsedYear;
      }
    }
    ris += `PY  - ${year}\n`;
    
    // Abstract/Notes (include source metadata)
    const notes = `Exported from NotebookLM notebook: ${escapeRIS(notebookName)}. Source type: ${source.type}.`;
    ris += `AB  - ${notes}\n`;
    
    // Keywords/Tags
    ris += `KW  - NotebookLM\n`;
    ris += `KW  - ${source.type}\n`;
    if (notebookName) {
      ris += `KW  - ${escapeRIS(notebookName)}\n`;
    }
    
    // Database/Source field
    ris += `DB  - NotebookLM\n`;
    
    // End entry
    ris += `ER  - \n\n`;
    entryCount++;
  });
  
  // Add Notebook Summary entry with conversations (if available)
  if (window.notebookConversations && window.notebookConversations.length > 0) {
    ris += `TY  - RPRT\n`;  // Report type for notebook summary
    ris += `TI  - NotebookLM Research Notebook: ${notebookName}\n`;
    ris += `AU  - NotebookLM AI Assistant\n`;
    ris += `DA  - ${new Date().toISOString().split('T')[0]}\n`;
    ris += `PY  - ${new Date().getFullYear()}\n`;
    ris += `KW  - NotebookLM\n`;
    ris += `KW  - Research Context\n`;
    ris += `KW  - AI Conversations\n`;
    ris += `AB  - This entry contains the research conversation history from NotebookLM for the notebook "${notebookName}". It includes all questions asked and AI responses generated during the research process.\n`;
    
    // Add all conversations as notes
    ris += `N1  - === NotebookLM RESEARCH CONVERSATIONS ===\n`;
    ris += `N1  - Notebook: ${notebookName}\n`;
    ris += `N1  - Date: ${new Date().toLocaleDateString()}\n`;
    ris += `N1  - Total Messages: ${window.notebookConversations.length}\n`;
    ris += `N1  - .\n`;
    
    let questionNum = 0;
    let responseNum = 0;
    
    window.notebookConversations.forEach((conv) => {
      if (conv.role === 'user') {
        questionNum++;
        ris += `N1  - .\n`;
        ris += `N1  - [QUESTION ${questionNum}]: ${conv.content}\n`;
      } else {
        responseNum++;
        ris += `N1  - .\n`;
        ris += `N1  - [AI RESPONSE ${responseNum}]: ${conv.content}\n`;
      }
    });
    
    ris += `N1  - .\n`;
    ris += `N1  - === END OF CONVERSATIONS ===\n`;
    ris += `ER  -\n\n`;
    entryCount++;
  }
  
  console.log(`Generated RIS with ${entryCount} unique entries (filtered ${sources.length - entryCount} duplicates)`);
  return ris;
}

// Escape special characters for RIS
function escapeRIS(text) {
  if (!text) return '';
  // RIS format requirements:
  // - Remove or escape line breaks
  // - Remove tabs
  // - Trim whitespace
  // - Remove multiple spaces
  return text
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500); // Limit length to prevent issues
}

// Sanitize filename
function sanitizeFilename(name) {
  return name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 100); // Limit length
}

// Download File
function downloadFile(content, filename) {
  return new Promise((resolve, reject) => {
    // Use proper MIME type for RIS files
    const blob = new Blob([content], { type: 'application/x-research-info-systems;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
        resolve(downloadId);
      }
    });
  });
}

// Show State
function showState(state) {
  const states = ['loading', 'ready', 'success', 'error'];
  states.forEach(s => {
    document.getElementById(s).style.display = s === state ? 'block' : 'none';
  });
}

// Show Success
function showSuccess(count, filename) {
  const message = `Successfully exported ${count} source${count !== 1 ? 's' : ''} to ${filename}`;
  document.getElementById('successMessage').textContent = message;
  showState(States.SUCCESS);
}

// Show Error
function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  showState(States.ERROR);
}

// Reset to Ready State
function resetToReady() {
  initializePopup();
}

// ============================================
// ENRICHMENT FUNCTIONALITY
// ============================================

// Handle Enrichment Export Button
async function handleEnrichmentExport() {
  console.log('[Enrichment] Button clicked');
  console.log('[Enrichment] currentSources:', currentSources);
  console.log('[Enrichment] notebookName:', notebookName);
  
  try {
    const btn = document.getElementById('enrichExportBtn');
    btn.disabled = true;
    btn.querySelector('.button-text').textContent = 'Starting enrichment...';
    
    // Use already-extracted sources
    if (!currentSources || currentSources.length === 0) {
      console.error('[Enrichment] No sources available');
      throw new Error('No sources available. Please refresh the page and try again.');
    }
    
    console.log(`[Enrichment] Starting enrichment for ${currentSources.length} sources`);
    
    // Show enrichment modal
    showEnrichmentModal(currentSources, notebookName);
    
  } catch (error) {
    console.error('[Enrichment] Error:', error);
    showError(error.message);
    const btn = document.getElementById('enrichExportBtn');
    if (btn) {
      btn.disabled = false;
      btn.querySelector('.button-text').textContent = 'Export with Metadata Enrichment';
    }
  }
}

// Handle Zotero Export
async function handleZoteroExport() {
  console.log('[Zotero] Export button clicked');
  
  try {
    const btn = document.getElementById('zoteroExportBtn');
    btn.disabled = true;
    btn.querySelector('.button-text').textContent = 'Connecting to Zotero...';
    
    // Check if we have sources
    if (!currentSources || currentSources.length === 0) {
      throw new Error('No sources available. Please refresh the page and try again.');
    }
    
    // Check if Zotero API is configured
    const config = await chrome.storage.local.get([
      'zoteroApiKey',
      'zoteroLibraryType',
      'zoteroUserId',
      'zoteroGroupId'
    ]);
    
    if (!config.zoteroApiKey) {
      throw new Error('Zotero API not configured. Please go to Settings to configure your API key.');
    }
    
    const libraryId = config.zoteroLibraryType === 'user' ? config.zoteroUserId : config.zoteroGroupId;
    if (!libraryId) {
      throw new Error('Library ID not configured. Please go to Settings.');
    }
    
    console.log(`[Zotero] Starting export for ${currentSources.length} sources`);
    
    // Get conversations if available
    const conversations = window.notebookConversations || [];
    
    // Show Zotero modal and start export
    await showZoteroModal(currentSources, notebookName, conversations);
    
  } catch (error) {
    console.error('[Zotero] Error:', error);
    showZoteroError(error.message);
    const btn = document.getElementById('zoteroExportBtn');
    if (btn) {
      btn.disabled = false;
      btn.querySelector('.button-text').textContent = 'Export to Zotero Directly';
    }
  }
}

// Show Zotero Modal and Start Export
async function showZoteroModal(sources, notebookName, conversations) {
  const modal = document.getElementById('zoteroModal');
  const stepConfig = document.getElementById('stepConfig');
  const stepCollection = document.getElementById('stepCollection');
  const stepProcessing = document.getElementById('stepProcessing');
  const stepConversations = document.getElementById('stepConversations');
  
  console.log('[Zotero Modal] Starting modal display');
  console.log('[Zotero Modal] Modal element:', modal);
  console.log('[Zotero Modal] Step elements:', {stepConfig, stepCollection, stepProcessing, stepConversations});
  
  if (!modal) {
    console.error('[Zotero Modal] Modal element not found!');
    throw new Error('Zotero modal not found in page. Please refresh and try again.');
  }
  
  // Show modal
  modal.style.display = 'flex';
  console.log('[Zotero Modal] Modal displayed');  modal.style.display = 'flex';
  
  // Reset progress steps
  [stepConfig, stepCollection, stepProcessing, stepConversations].forEach(step => {
    step.classList.remove('active', 'complete', 'error');
  });
  
  try {
    // Step 1: Check configuration
    stepConfig.classList.add('active');
    stepConfig.querySelector('.step-status').textContent = 'Checking...';
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const config = await chrome.storage.local.get([
      'zoteroApiKey',
      'zoteroLibraryType',
      'zoteroUserId',
      'zoteroGroupId',
      'zoteroAutoCreateCollections'
    ]);
    
    stepConfig.classList.remove('active');
    stepConfig.classList.add('complete');
    stepConfig.querySelector('.step-status').textContent = 'Ready';
    
    // Step 2: Create/find collection
    stepCollection.classList.add('active');
    stepCollection.querySelector('.step-status').textContent = 'Creating...';
    
    const libraryType = config.zoteroLibraryType || 'user';
    const libraryId = libraryType === 'user' ? config.zoteroUserId : config.zoteroGroupId;
    
    let collectionKey = null;
    if (config.zoteroAutoCreateCollections !== false) {
      collectionKey = await findOrCreateCollection(notebookName, config.zoteroApiKey, libraryType, libraryId);
    }
    
    stepCollection.classList.remove('active');
    stepCollection.classList.add('complete');
    stepCollection.querySelector('.step-status').textContent = collectionKey ? 'Created' : 'Skipped';
    
    // Step 3: Process sources
    stepProcessing.classList.add('active');
    stepProcessing.querySelector('.step-status').textContent = 'Enriching 0/' + sources.length;
    stepProcessing.querySelector('.step-text').textContent = 'Enriching metadata and exporting sources...';
    
    const results = await exportSourcesToZotero(sources, config, libraryId, libraryType, collectionKey, (progress) => {
      stepProcessing.querySelector('.step-status').textContent = 'Enriching ' + progress + '/' + sources.length;
    });
    
    stepProcessing.classList.remove('active');
    stepProcessing.classList.add('complete');
    stepProcessing.querySelector('.step-status').textContent = 'Done';
    stepProcessing.querySelector('.step-text').textContent = 'Processing sources...';
    
    // Step 4: Add conversations
    if (conversations && conversations.length > 0) {
      stepConversations.classList.add('active');
      stepConversations.querySelector('.step-status').textContent = 'Adding...';
      
      try {
        await addConversationsToZotero(notebookName, conversations, config, libraryId, libraryType, collectionKey);
        
        stepConversations.classList.remove('active');
        stepConversations.classList.add('complete');
        stepConversations.querySelector('.step-status').textContent = 'Added';
        
        results.created++; // Count the notebook summary
      } catch (convError) {
        console.error('[Zotero] Failed to add conversations:', convError);
        stepConversations.classList.remove('active');
        stepConversations.classList.add('error');
        stepConversations.querySelector('.step-status').textContent = 'Failed (optional)';
        // Don't throw - continue with the export
      }
    } else {
      stepConversations.querySelector('.step-status').textContent = 'None';
      stepConversations.classList.add('complete');
    }
    
    // Show summary
    showZoteroSummary(results);
    
  } catch (error) {
    console.error('[Zotero] Export error:', error);
    showZoteroError(error.message);
    throw error; // Re-throw so handleZoteroExport can reset the button
  }
}

// Show Enrichment Modal and Start Process
async function showEnrichmentModal(sources, notebookName) {
  const modal = document.getElementById('enrichModal');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const progressLog = document.getElementById('progressLog');
  const progressSummary = document.getElementById('progressSummary');
  
  // Show modal
  modal.style.display = 'flex';
  
  // Reset UI
  progressFill.style.width = '0%';
  progressText.textContent = 'Starting enrichment...';
  progressLog.innerHTML = '';
  progressSummary.style.display = 'none';
  
  try {
    // Progress callback
    const progressCallback = (progress) => {
      // Update progress bar
      const percentage = Math.round((progress.current / progress.total) * 100);
      progressFill.style.width = `${percentage}%`;
      progressText.textContent = `Processing ${progress.current} of ${progress.total} sources...`;
      
      // Add log entry
      if (progress.source) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${progress.type || ''}`;
        logEntry.innerHTML = `
          <span class="log-icon">${getStatusIcon(progress.type)}</span>
          <span class="log-text">${progress.source}: ${progress.status}</span>
        `;
        progressLog.appendChild(logEntry);
        progressLog.scrollTop = progressLog.scrollHeight;
      }
      
      // Show summary when complete
      if (progress.type === 'complete' && progress.results) {
        document.getElementById('statSuccess').textContent = progress.results.success;
        document.getElementById('statPartial').textContent = progress.results.partial;
        document.getElementById('statFailed').textContent = progress.results.failed;
        progressSummary.style.display = 'block';
      }
    };
    
    // Run enrichment
    const enrichedSources = await enrichSources(sources, progressCallback);
    
    // Store enriched sources for download
    window.enrichedSources = enrichedSources;
    window.enrichedNotebookName = notebookName;
    
  } catch (error) {
    console.error('Enrichment process error:', error);
    progressText.textContent = `Error: ${error.message}`;
    
    // Add error log entry
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry error';
    logEntry.innerHTML = `
      <span class="log-icon">✗</span>
      <span class="log-text">Enrichment failed: ${error.message}</span>
    `;
    progressLog.appendChild(logEntry);
  }
}

// Close modal and download enriched RIS
document.getElementById('closeModal')?.addEventListener('click', async () => {
  try {
    if (!window.enrichedSources) {
      throw new Error('No enriched data available');
    }
    
    // Generate enriched RIS file
    const risContent = generateEnrichedRIS(window.enrichedSources, window.enrichedNotebookName);
    
    // Download file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `${sanitizeFilename(window.enrichedNotebookName)}_enriched_${timestamp}.ris`;
    await downloadFile(risContent, filename);
    
    // Close modal
    document.getElementById('enrichModal').style.display = 'none';
    
    // Show success
    showSuccess(window.enrichedSources.length, filename);
    
    // Clean up
    delete window.enrichedSources;
    delete window.enrichedNotebookName;
    
  } catch (error) {
    console.error('Download error:', error);
    alert('Failed to download file: ' + error.message);
  }
});

// Generate enriched RIS file
function generateEnrichedRIS(sources, notebookName) {
  let ris = '';
  
  for (const source of sources) {
    // Determine RIS type based on enrichment
    let risType = 'JOUR'; // Default to journal article
    
    if (source.enrichmentType === 'youtube') {
      risType = 'VIDEO';
    } else if (source.enrichmentType === 'web') {
      risType = 'ELEC';
    } else if (source.enrichmentType === 'arxiv') {
      risType = 'ELEC';
    } else if (source.type === 'pdf' || source.doi) {
      risType = 'JOUR';
    }
    
    // Start entry
    ris += `TY  - ${risType}\n`;
    
    // Title
    ris += `TI  - ${source.title}\n`;
    
    // Authors
    if (source.authors && source.authors.length > 0) {
      source.authors.forEach(author => {
        ris += `AU  - ${author}\n`;
      });
    }
    
    // Year
    if (source.year) {
      ris += `PY  - ${source.year}\n`;
    }
    
    // Journal/Publication
    if (source.journal) {
      ris += `T2  - ${source.journal}\n`;
      ris += `JO  - ${source.journal}\n`;
    }
    
    // Volume
    if (source.volume) {
      ris += `VL  - ${source.volume}\n`;
    }
    
    // Issue
    if (source.issue) {
      ris += `IS  - ${source.issue}\n`;
    }
    
    // Pages
    if (source.pages) {
      const pageMatch = source.pages.match(/(\d+)-(\d+)/);
      if (pageMatch) {
        ris += `SP  - ${pageMatch[1]}\n`;
        ris += `EP  - ${pageMatch[2]}\n`;
      }
    }
    
    // DOI
    if (source.doi) {
      ris += `DO  - ${source.doi}\n`;
    }
    
    // URL
    if (source.url) {
      ris += `UR  - ${source.url}\n`;
    }
    
    // Abstract
    if (source.abstract) {
      const cleanAbstract = source.abstract.replace(/\n/g, ' ').trim();
      ris += `AB  - ${cleanAbstract}\n`;
    }
    
    // Publisher
    if (source.publisher) {
      ris += `PB  - ${source.publisher}\n`;
    }
    
    // ISSN
    if (source.issn) {
      ris += `SN  - ${source.issn}\n`;
    }
    
    // Keywords
    if (source.keywords && source.keywords.length > 0) {
      source.keywords.forEach(keyword => {
        ris += `KW  - ${keyword}\n`;
      });
    }
    
    // Categories (for arXiv)
    if (source.categories && source.categories.length > 0) {
      source.categories.forEach(cat => {
        ris += `KW  - ${cat}\n`;
      });
    }
    
    // Tags (for YouTube)
    if (source.tags && source.tags.length > 0) {
      source.tags.slice(0, 5).forEach(tag => {
        ris += `KW  - ${tag}\n`;
      });
    }
    
    // Date (for web articles, videos)
    if (source.date && !source.year) {
      ris += `DA  - ${source.date}\n`;
    }
    
    // Duration (for videos)
    if (source.duration) {
      ris += `N1  - Duration: ${source.duration}\n`;
    }
    
    // arXiv ID
    if (source.arxivId) {
      ris += `N1  - arXiv:${source.arxivId}\n`;
    }
    
    // End entry
    ris += `ER  -\n\n`;
  }
  
  // Add Notebook Summary entry with conversations (if available)
  if (window.notebookConversations && window.notebookConversations.length > 0) {
    ris += `TY  - RPRT\n`;  // Report type for notebook summary
    ris += `TI  - NotebookLM Research Notebook: ${notebookName}\n`;
    ris += `AU  - NotebookLM AI Assistant\n`;
    ris += `DA  - ${new Date().toISOString().split('T')[0]}\n`;
    ris += `PY  - ${new Date().getFullYear()}\n`;
    ris += `KW  - NotebookLM\n`;
    ris += `KW  - Research Context\n`;
    ris += `KW  - AI Conversations\n`;
    ris += `AB  - This entry contains the research conversation history from NotebookLM for the notebook "${notebookName}". It includes all questions asked and AI responses generated during the research process.\n`;
    
    // Add all conversations as notes
    ris += `N1  - === NotebookLM RESEARCH CONVERSATIONS ===\n`;
    ris += `N1  - Notebook: ${notebookName}\n`;
    ris += `N1  - Date: ${new Date().toLocaleDateString()}\n`;
    ris += `N1  - Total Messages: ${window.notebookConversations.length}\n`;
    ris += `N1  - .\n`;
    
    let questionNum = 0;
    let responseNum = 0;
    
    window.notebookConversations.forEach((conv) => {
      if (conv.role === 'user') {
        questionNum++;
        ris += `N1  - .\n`;
        ris += `N1  - [QUESTION ${questionNum}]: ${conv.content}\n`;
      } else {
        responseNum++;
        ris += `N1  - .\n`;
        ris += `N1  - [AI RESPONSE ${responseNum}]: ${conv.content}\n`;
      }
    });
    
    ris += `N1  - .\n`;
    ris += `N1  - === END OF CONVERSATIONS ===\n`;
    ris += `ER  -\n\n`;
  }
  
  return ris;
}

// Get status icon for log entries
function getStatusIcon(type) {
  switch (type) {
    case 'success': return '✓';
    case 'partial': return '⚠';
    case 'failed': return '○';
    case 'error': return '✗';
    default: return '•';
  }
}

// Zotero API Helper Functions

async function findOrCreateCollection(notebookName, apiKey, libraryType, libraryId) {
  try {
    const collectionName = `NotebookLM: ${notebookName}`;
    const baseUrl = `https://api.zotero.org/${libraryType}s/${libraryId}`;
    
    // Search for existing collection
    const searchResponse = await fetch(`${baseUrl}/collections?q=${encodeURIComponent(collectionName)}`, {
      headers: {
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': '3'
      }
    });
    
    if (!searchResponse.ok) {
      console.warn('Failed to search collections');
      return null;
    }
    
    const collections = await searchResponse.json();
    const existing = collections.find(c => c.data.name === collectionName);
    
    if (existing) {
      console.log('[Zotero] Found existing collection:', existing.key);
      return existing.key;
    }
    
    // Create new collection
    const createResponse = await fetch(`${baseUrl}/collections`, {
      method: 'POST',
      headers: {
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': '3',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([{
        name: collectionName,
        parentCollection: false
      }])
    });
    
    if (!createResponse.ok) {
      console.warn('Failed to create collection');
      return null;
    }
    
    const result = await createResponse.json();
    const collectionKey = result.successful ? result.successful['0'].key : null;
    
    console.log('[Zotero] Created new collection:', collectionKey);
    return collectionKey;
  } catch (error) {
    console.error('[Zotero] Collection error:', error);
    return null;
  }
}

async function exportSourcesToZotero(sources, config, libraryId, libraryType, collectionKey, progressCallback) {
  const results = {
    created: 0,
    skipped: 0,
    failed: 0
  };
  
  const baseUrl = `https://api.zotero.org/${libraryType}s/${libraryId}`;
  
  // Step 1: Enrich sources first!
  console.log('[Zotero] Starting metadata enrichment for', sources.length, 'sources');
  
  const enrichedSources = [];
  let doiCount = 0;
  let urlCount = 0;
  let fallbackCount = 0;
  
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    
    if (progressCallback) {
      progressCallback(i + 1);
    }
    
    try {
      // Enrich the source using hybrid approach
      const enriched = await enrichSingleSource(source);
      enrichedSources.push(enriched);
      
      // Track enrichment method
      if (enriched.hadDOI) {
        doiCount++;
        console.log(`[Zotero] ✓ DOI-based (${i + 1}/${sources.length}):`, source.title.substring(0, 60));
      } else if (enriched.hadURL) {
        urlCount++;
        console.log(`[Zotero] ✓ URL-based (${i + 1}/${sources.length}):`, source.title.substring(0, 60));
      } else {
        fallbackCount++;
        console.log(`[Zotero] ⚠ Fallback (${i + 1}/${sources.length}):`, source.title.substring(0, 60));
      }
    } catch (error) {
      console.error('[Zotero] Enrichment failed for:', source.title, error);
      // Use original source if enrichment fails
      enrichedSources.push(source);
      fallbackCount++;
    }
  }
  
  console.log('[Zotero] Enrichment complete:', {
    total: sources.length,
    doi: doiCount,
    url: urlCount,
    fallback: fallbackCount
  });
  
  // Step 2: Convert and batch export to Zotero
  console.log('[Zotero] Converting enriched sources to Zotero format');
  const itemsToCreate = [];
  
  for (let i = 0; i < enrichedSources.length; i++) {
    const source = enrichedSources[i];
    
    try {
      // Convert source to Zotero item format
      const item = sourceToZoteroItem(source, collectionKey);
      itemsToCreate.push(item);
      
      // Batch create every 50 items
      if (itemsToCreate.length >= 50) {
        await createZoteroItems(itemsToCreate, baseUrl, config.zoteroApiKey);
        results.created += itemsToCreate.length;
        itemsToCreate.length = 0;
      }
    } catch (error) {
      console.error('[Zotero] Error processing source:', source.title, error);
      results.failed++;
    }
  }
  
  // Create remaining items
  if (itemsToCreate.length > 0) {
    await createZoteroItems(itemsToCreate, baseUrl, config.zoteroApiKey);
    results.created += itemsToCreate.length;
  }
  
  return results;
}

async function createZoteroItems(items, baseUrl, apiKey) {
  const response = await fetch(`${baseUrl}/items`, {
    method: 'POST',
    headers: {
      'Zotero-API-Key': apiKey,
      'Zotero-API-Version': '3',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(items)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create items: ${response.status}`);
  }
  
  return await response.json();
}

function sourceToZoteroItem(source, collectionKey) {
  const item = {
    itemType: getZoteroItemType(source.type),
    title: source.title || 'Untitled',
    creators: [],
    tags: [{ tag: 'NotebookLM' }],
    collections: collectionKey ? [collectionKey] : []
  };
  
  // Add authors
  if (source.authors && source.authors.length > 0) {
    item.creators = source.authors.map(author => ({
      creatorType: 'author',
      name: author
    }));
  }
  
  // Add other metadata
  if (source.doi) item.DOI = source.doi;
  if (source.url) item.url = source.url;
  if (source.date || source.year) {
    item.date = source.date || source.year.toString();
  }
  if (source.abstract) item.abstractNote = source.abstract;
  if (source.journal) item.publicationTitle = source.journal;
  if (source.volume) item.volume = source.volume;
  if (source.issue) item.issue = source.issue;
  if (source.pages) item.pages = source.pages;
  if (source.publisher) item.publisher = source.publisher;
  
  return item;
}

function getZoteroItemType(sourceType) {
  const typeMap = {
    'PDF': 'journalArticle',
    'Web Article': 'webpage',
    'YouTube': 'videoRecording',
    'Google Docs': 'document',
    'Google Slides': 'presentation'
  };
  
  return typeMap[sourceType] || 'journalArticle';
}

async function addConversationsToZotero(notebookName, conversations, config, libraryId, libraryType, collectionKey) {
  const baseUrl = `https://api.zotero.org/${libraryType}s/${libraryId}`;
  
  // Create notebook summary item
  const item = {
    itemType: 'report',
    title: `NotebookLM Research Notebook: ${notebookName}`,
    creators: [{
      creatorType: 'author',
      name: 'NotebookLM AI Assistant'
    }],
    date: new Date().toISOString().split('T')[0],
    abstractNote: `This entry contains the research conversation history from NotebookLM for the notebook "${notebookName}".`,
    tags: [
      { tag: 'NotebookLM' },
      { tag: 'Research Context' },
      { tag: 'AI Conversations' }
    ],
    collections: collectionKey ? [collectionKey] : []
  };
  
  // Create the item first
  const createResponse = await fetch(`${baseUrl}/items`, {
    method: 'POST',
    headers: {
      'Zotero-API-Key': config.zoteroApiKey,
      'Zotero-API-Version': '3',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([item])
  });
  
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error('[Zotero] Create item failed:', errorText);
    throw new Error('Failed to create notebook summary item: ' + createResponse.status);
  }
  
  const result = await createResponse.json();
  console.log('[Zotero] Create response:', result);
  
  // Zotero API returns: { successful: { "0": { key: "ABC123", ... } }, failed: {} }
  let itemKey = null;
  
  if (result.successful && Object.keys(result.successful).length > 0) {
    const firstKey = Object.keys(result.successful)[0];
    itemKey = result.successful[firstKey].key;
  } else if (result.success && result.success.length > 0) {
    // Alternative response format
    itemKey = result.success[0].key;
  }
  
  if (!itemKey) {
    console.error('[Zotero] No item key in response:', result);
    throw new Error('No item key returned from Zotero API');
  }
  
  console.log('[Zotero] Created item with key:', itemKey);
  
  // Now add conversations as notes
  let noteContent = '<h2>NotebookLM Research Conversations</h2>\n';
  noteContent += `<p><strong>Notebook:</strong> ${notebookName}</p>\n`;
  noteContent += `<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>\n`;
  noteContent += `<p><strong>Total Messages:</strong> ${conversations.length}</p>\n<hr>\n`;
  
  let questionNum = 0;
  let responseNum = 0;
  
  conversations.forEach(conv => {
    if (conv.role === 'user') {
      questionNum++;
      noteContent += `\n<h3>Question ${questionNum}</h3>\n`;
      noteContent += `<p>${conv.content}</p>\n`;
    } else {
      responseNum++;
      noteContent += `\n<h3>AI Response ${responseNum}</h3>\n`;
      noteContent += `<p>${conv.content}</p>\n`;
    }
  });
  
  // Add note to item
  const noteResponse = await fetch(`${baseUrl}/items`, {
    method: 'POST',
    headers: {
      'Zotero-API-Key': config.zoteroApiKey,
      'Zotero-API-Version': '3',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      itemType: 'note',
      parentItem: itemKey,
      note: noteContent,
      tags: [{ tag: 'NotebookLM Conversations' }]
    }])
  });
  
  if (!noteResponse.ok) {
    console.warn('Failed to add conversations note');
  }
}

function showZoteroSummary(results) {
  document.getElementById('zoteroProgress').style.display = 'none';
  document.getElementById('zoteroSummary').style.display = 'block';
  
  document.getElementById('zoteroCreated').textContent = results.created;
  document.getElementById('zoteroSkipped').textContent = results.skipped;
  document.getElementById('zoteroFailed').textContent = results.failed;
}

function showZoteroError(message) {
  const modal = document.getElementById('zoteroModal');
  modal.style.display = 'flex';
  
  document.getElementById('zoteroProgress').style.display = 'none';
  document.getElementById('zoteroSummary').style.display = 'none';
  document.getElementById('zoteroError').style.display = 'block';
  document.getElementById('zoteroErrorMessage').textContent = message;
}

// Enrich a single source using hybrid metadata extraction
// Tries: 1) DOI → CrossRef, 2) URL → Source APIs, 3) Fallback to original enrichment
async function enrichSingleSource(source) {
  try {
    console.log('[Enrich Single] Starting hybrid extraction for:', source.title);
    
    // Step 1: Try hybrid extraction (DOI or URL based)
    const hybridMetadata = await extractMetadataHybrid(source);
    
    if (hybridMetadata) {
      console.log('[Enrich Single] Hybrid extraction successful!');
      console.log('[Enrich Single] Method:', hybridMetadata.enrichmentSource);
      console.log('[Enrich Single] Confidence:', hybridMetadata.confidence);
      return hybridMetadata;
    }
    
    // Step 2: Fallback to original enrichment (CrossRef, OpenAlex, etc.)
    console.log('[Enrich Single] Hybrid failed, using original enrichment');
    const enriched = await enrichSource(source);
    return enriched;
    
  } catch (error) {
    console.error('[Enrich Single] Error enriching source:', source.title, error);
    // Return original source if all enrichment fails
    return source;
  }
}

// Check if Zotero API is configured
async function checkZoteroConfig() {
  console.log('[DEBUG] checkZoteroConfig called');
  try {
    const result = await chrome.storage.local.get([
      'zoteroApiKey',
      'zoteroLibraryType',
      'zoteroUserId',
      'zoteroGroupId'
    ]);
    
    console.log('[DEBUG] Storage result:', {
      hasApiKey: !!result.zoteroApiKey,
      libraryType: result.zoteroLibraryType,
      hasUserId: !!result.zoteroUserId,
      hasGroupId: !!result.zoteroGroupId
    });
    
    if (!result.zoteroApiKey) {
      console.log('[DEBUG] No API key found');
      return false;
    }
    
    const libraryType = result.zoteroLibraryType || 'user';
    const libraryId = libraryType === 'user' ? result.zoteroUserId : result.zoteroGroupId;
    
    console.log('[DEBUG] Library check:', {
      libraryType,
      libraryId,
      hasLibraryId: !!libraryId
    });
    
    return !!libraryId;
  } catch (error) {
    console.error('[DEBUG] Error checking Zotero config:', error);
    return false;
  }
}

