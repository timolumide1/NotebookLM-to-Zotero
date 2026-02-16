/**
 * Zotero API Client
 * Handles direct export to Zotero libraries via API
 */

const ZOTERO_API_BASE = 'https://api.zotero.org';
const ZOTERO_API_VERSION = 3;

/**
 * Zotero API Client Class
 */
class ZoteroAPI {
  constructor(apiKey, userID, libraryType = 'user') {
    this.apiKey = apiKey;
    this.userID = userID;
    this.libraryType = libraryType; // 'user' or 'group'
  }
  
  /**
   * Get base library URL
   */
  getLibraryURL() {
    if (this.libraryType === 'group') {
      return `${ZOTERO_API_BASE}/groups/${this.userID}`;
    }
    return `${ZOTERO_API_BASE}/users/${this.userID}`;
  }
  
  /**
   * Make API request
   */
  async request(endpoint, method = 'GET', data = null) {
    const url = `${this.getLibraryURL()}${endpoint}`;
    
    const headers = {
      'Zotero-API-Version': ZOTERO_API_VERSION.toString(),
      'Zotero-API-Key': this.apiKey,
      'Content-Type': 'application/json'
    };
    
    const options = {
      method: method,
      headers: headers
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }
    
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zotero API Error (${response.status}): ${errorText}`);
      }
      
      // For DELETE requests, return true
      if (method === 'DELETE') {
        return { success: true };
      }
      
      // Parse JSON response
      const result = await response.json();
      
      // Get version header for updates
      const version = response.headers.get('Last-Modified-Version');
      
      return {
        data: result,
        version: version
      };
      
    } catch (error) {
      console.error('Zotero API request failed:', error);
      throw error;
    }
  }
  
  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const result = await this.request('/collections?limit=1');
      return {
        success: true,
        message: 'Successfully connected to Zotero!'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get or create collection for NotebookLM notebook
   */
  async getOrCreateCollection(notebookName) {
    try {
      // Search for existing collection
      const collections = await this.request('/collections');
      const existing = collections.data.find(c => 
        c.data.name === `NotebookLM: ${notebookName}`
      );
      
      if (existing) {
        console.log('Found existing collection:', existing.key);
        return existing.key;
      }
      
      // Create new collection
      const newCollection = await this.request('/collections', 'POST', [{
        name: `NotebookLM: ${notebookName}`,
        parentCollection: false
      }]);
      
      const collectionKey = newCollection.data.successful['0'].key;
      console.log('Created new collection:', collectionKey);
      return collectionKey;
      
    } catch (error) {
      console.error('Error managing collection:', error);
      throw error;
    }
  }
  
  /**
   * Search for existing item by title
   */
  async findItemByTitle(title) {
    try {
      const searchTitle = encodeURIComponent(title);
      const result = await this.request(`/items?q=${searchTitle}&limit=5`);
      
      if (!result.data || result.data.length === 0) {
        return null;
      }
      
      // Find best match
      for (const item of result.data) {
        const itemTitle = item.data.title || '';
        if (itemTitle.toLowerCase().includes(title.toLowerCase()) || 
            title.toLowerCase().includes(itemTitle.toLowerCase())) {
          return item;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error searching for item:', error);
      return null;
    }
  }
  
  /**
   * Convert source to Zotero item format
   */
  sourceToZoteroItem(source, collectionKey) {
    const item = {
      itemType: this.getItemType(source.type),
      title: source.title || 'Untitled',
      collections: [collectionKey],
      tags: [
        { tag: 'NotebookLM' },
        { tag: 'Exported from NotebookLM' }
      ]
    };
    
    // Add date
    if (source.date) {
      item.date = source.date;
    } else if (source.year) {
      item.date = source.year.toString();
    }
    
    // Add authors
    if (source.authors && source.authors.length > 0) {
      item.creators = source.authors.map(author => ({
        creatorType: 'author',
        name: author
      }));
    }
    
    // Add DOI
    if (source.doi) {
      item.DOI = source.doi;
    }
    
    // Add URL
    if (source.url) {
      item.url = source.url;
    }
    
    // Add abstract
    if (source.abstract) {
      item.abstractNote = source.abstract;
    }
    
    // Journal-specific fields
    if (source.journal) {
      item.publicationTitle = source.journal;
    }
    if (source.volume) {
      item.volume = source.volume;
    }
    if (source.issue) {
      item.issue = source.issue;
    }
    if (source.pages) {
      item.pages = source.pages;
    }
    if (source.publisher) {
      item.publisher = source.publisher;
    }
    if (source.issn) {
      item.ISSN = source.issn;
    }
    
    // arXiv
    if (source.arxivId) {
      item.archiveID = source.arxivId;
      item.archive = 'arXiv';
    }
    
    // Add enrichment info as note
    if (source.enrichmentType && source.enrichmentType !== 'none') {
      item.tags.push({ tag: `Enriched via ${source.enrichmentType}` });
    }
    
    return item;
  }
  
  /**
   * Get Zotero item type from source type
   */
  getItemType(sourceType) {
    const typeMap = {
      'document': 'journalArticle',
      'pdf': 'journalArticle',
      'web': 'webpage',
      'youtube': 'videoRecording',
      'drive': 'document',
      'arxiv': 'preprint'
    };
    
    return typeMap[sourceType] || 'journalArticle';
  }
  
  /**
   * Create Zotero items from sources
   */
  async createItems(sources, collectionKey, progressCallback) {
    const results = {
      created: [],
      updated: [],
      skipped: [],
      failed: []
    };
    
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: sources.length,
          source: source.title,
          status: 'Checking for duplicates...'
        });
      }
      
      try {
        // Check for duplicate
        const existing = await this.findItemByTitle(source.title);
        
        if (existing) {
          // Update existing item with new metadata
          const updatedData = this.sourceToZoteroItem(source, collectionKey);
          
          // Merge with existing data (keep existing fields, add new ones)
          Object.keys(updatedData).forEach(key => {
            if (key !== 'collections' && key !== 'tags') {
              if (updatedData[key] && !existing.data[key]) {
                existing.data[key] = updatedData[key];
              }
            }
          });
          
          // Add to collection if not already there
          if (!existing.data.collections.includes(collectionKey)) {
            existing.data.collections.push(collectionKey);
          }
          
          // Update tags
          const existingTags = existing.data.tags.map(t => t.tag);
          updatedData.tags.forEach(tag => {
            if (!existingTags.includes(tag.tag)) {
              existing.data.tags.push(tag);
            }
          });
          
          await this.request(`/items/${existing.key}`, 'PUT', existing.data);
          
          results.updated.push(source.title);
          
          if (progressCallback) {
            progressCallback({
              current: i + 1,
              total: sources.length,
              source: source.title,
              status: '✓ Updated existing item',
              type: 'success'
            });
          }
        } else {
          // Create new item
          const itemData = this.sourceToZoteroItem(source, collectionKey);
          
          const response = await this.request('/items', 'POST', [itemData]);
          
          if (response.data.successful) {
            results.created.push(source.title);
            
            if (progressCallback) {
              progressCallback({
                current: i + 1,
                total: sources.length,
                source: source.title,
                status: '✓ Created new item',
                type: 'success'
              });
            }
          } else {
            results.failed.push(source.title);
            
            if (progressCallback) {
              progressCallback({
                current: i + 1,
                total: sources.length,
                source: source.title,
                status: '✗ Failed to create',
                type: 'error'
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error processing ${source.title}:`, error);
        results.failed.push(source.title);
        
        if (progressCallback) {
          progressCallback({
            current: i + 1,
            total: sources.length,
            source: source.title,
            status: `✗ Error: ${error.message}`,
            type: 'error'
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Create notebook summary as note
   */
  async createNotebookSummary(notebookName, conversations, collectionKey) {
    try {
      // Create a note item with conversations
      let noteContent = '<h1>NotebookLM Research Conversations</h1>';
      noteContent += `<p><strong>Notebook:</strong> ${notebookName}</p>`;
      noteContent += `<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>`;
      noteContent += `<p><strong>Total Messages:</strong> ${conversations.length}</p>`;
      noteContent += '<hr>';
      
      let questionNum = 0;
      let responseNum = 0;
      
      conversations.forEach(conv => {
        if (conv.role === 'user') {
          questionNum++;
          noteContent += `<h3>Question ${questionNum}</h3>`;
          noteContent += `<p>${conv.content}</p>`;
        } else {
          responseNum++;
          noteContent += `<h3>AI Response ${responseNum}</h3>`;
          noteContent += `<p>${conv.content}</p>`;
        }
      });
      
      const noteItem = {
        itemType: 'note',
        note: noteContent,
        collections: [collectionKey],
        tags: [
          { tag: 'NotebookLM' },
          { tag: 'Research Context' },
          { tag: 'AI Conversations' }
        ]
      };
      
      await this.request('/items', 'POST', [noteItem]);
      
      return { success: true };
    } catch (error) {
      console.error('Error creating notebook summary:', error);
      throw error;
    }
  }
}

/**
 * Get stored Zotero settings
 */
async function getZoteroSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['zoteroApiKey', 'zoteroUserID', 'zoteroLibraryType'], (result) => {
      resolve({
        apiKey: result.zoteroApiKey || '',
        userID: result.zoteroUserID || '',
        libraryType: result.zoteroLibraryType || 'user'
      });
    });
  });
}

/**
 * Save Zotero settings
 */
async function saveZoteroSettings(apiKey, userID, libraryType) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({
      zoteroApiKey: apiKey,
      zoteroUserID: userID,
      zoteroLibraryType: libraryType
    }, () => {
      resolve();
    });
  });
}

/**
 * Check if Zotero is configured
 */
async function isZoteroConfigured() {
  const settings = await getZoteroSettings();
  return !!(settings.apiKey && settings.userID);
}
