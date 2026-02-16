// Settings Page JavaScript

// DOM Elements
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const libraryTypeSelect = document.getElementById('libraryType');
const userIdInput = document.getElementById('userId');
const groupIdInput = document.getElementById('groupId');
const userIdGroup = document.getElementById('userIdGroup');
const groupIdGroup = document.getElementById('groupIdGroup');
const autoCreateCheckbox = document.getElementById('autoCreateCollections');
const duplicateHandlingSelect = document.getElementById('duplicateHandling');
const saveSettingsBtn = document.getElementById('saveSettings');
const testConnectionBtn = document.getElementById('testConnection');
const clearSettingsBtn = document.getElementById('clearSettings');
const statusMessage = document.getElementById('statusMessage');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
  updateStatusDisplay();
});

// Event Listeners
function setupEventListeners() {
  // Toggle API key visibility
  toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);
  
  // Library type change
  libraryTypeSelect.addEventListener('change', handleLibraryTypeChange);
  
  // Save settings
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Test connection
  testConnectionBtn.addEventListener('click', testConnection);
  
  // Clear settings
  clearSettingsBtn.addEventListener('click', clearSettings);
}

// Toggle API Key Visibility
function toggleApiKeyVisibility() {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleApiKeyBtn.textContent = 'Hide';
  } else {
    apiKeyInput.type = 'password';
    toggleApiKeyBtn.textContent = 'Show';
  }
}

// Handle Library Type Change
function handleLibraryTypeChange() {
  const type = libraryTypeSelect.value;
  
  if (type === 'user') {
    userIdGroup.classList.remove('hidden');
    groupIdGroup.classList.add('hidden');
    groupIdInput.value = '';
  } else {
    userIdGroup.classList.add('hidden');
    groupIdGroup.classList.remove('hidden');
    userIdInput.value = '';
  }
}

// Load Settings
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'zoteroApiKey',
      'zoteroLibraryType',
      'zoteroUserId',
      'zoteroGroupId',
      'zoteroAutoCreateCollections',
      'zoteroDuplicateHandling',
      'zoteroLastTested'
    ]);
    
    if (result.zoteroApiKey) {
      apiKeyInput.value = result.zoteroApiKey;
    }
    
    if (result.zoteroLibraryType) {
      libraryTypeSelect.value = result.zoteroLibraryType;
      handleLibraryTypeChange();
    }
    
    if (result.zoteroUserId) {
      userIdInput.value = result.zoteroUserId;
    }
    
    if (result.zoteroGroupId) {
      groupIdInput.value = result.zoteroGroupId;
    }
    
    if (result.zoteroAutoCreateCollections !== undefined) {
      autoCreateCheckbox.checked = result.zoteroAutoCreateCollections;
    }
    
    if (result.zoteroDuplicateHandling) {
      duplicateHandlingSelect.value = result.zoteroDuplicateHandling;
    }
    
    console.log('Settings loaded successfully');
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

// Save Settings
async function saveSettings() {
  // Validate inputs
  const apiKey = apiKeyInput.value.trim();
  const libraryType = libraryTypeSelect.value;
  const userId = userIdInput.value.trim();
  const groupId = groupIdInput.value.trim();
  
  if (!apiKey) {
    showStatus('Please enter your API key', 'error');
    apiKeyInput.focus();
    return;
  }
  
  if (libraryType === 'user' && !userId) {
    showStatus('Please enter your User ID', 'error');
    userIdInput.focus();
    return;
  }
  
  if (libraryType === 'group' && !groupId) {
    showStatus('Please enter your Group ID', 'error');
    groupIdInput.focus();
    return;
  }
  
  // Validate User ID (should be numbers only)
  if (libraryType === 'user' && !/^\d+$/.test(userId)) {
    showStatus('User ID should contain only numbers', 'error');
    userIdInput.focus();
    return;
  }
  
  // Validate Group ID (should be numbers only)
  if (libraryType === 'group' && !/^\d+$/.test(groupId)) {
    showStatus('Group ID should contain only numbers', 'error');
    groupIdInput.focus();
    return;
  }
  
  try {
    // Save to storage
    await chrome.storage.local.set({
      zoteroApiKey: apiKey,
      zoteroLibraryType: libraryType,
      zoteroUserId: libraryType === 'user' ? userId : '',
      zoteroGroupId: libraryType === 'group' ? groupId : '',
      zoteroAutoCreateCollections: autoCreateCheckbox.checked,
      zoteroDuplicateHandling: duplicateHandlingSelect.value
    });
    
    showStatus('✅ Settings saved successfully!', 'success');
    updateStatusDisplay();
    
    console.log('Settings saved:', {
      libraryType,
      libraryId: libraryType === 'user' ? userId : groupId,
      autoCreate: autoCreateCheckbox.checked,
      duplicateHandling: duplicateHandlingSelect.value
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('❌ Error saving settings: ' + error.message, 'error');
  }
}

// Test Connection
async function testConnection() {
  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing...';
  
  try {
    const result = await chrome.storage.local.get([
      'zoteroApiKey',
      'zoteroLibraryType',
      'zoteroUserId',
      'zoteroGroupId'
    ]);
    
    if (!result.zoteroApiKey) {
      showStatus('Please save your API key first', 'error');
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = 'Test Connection';
      return;
    }
    
    const libraryType = result.zoteroLibraryType || 'user';
    const libraryId = libraryType === 'user' ? result.zoteroUserId : result.zoteroGroupId;
    
    if (!libraryId) {
      showStatus('Please save your library ID first', 'error');
      testConnectionBtn.disabled = false;
      testConnectionBtn.textContent = 'Test Connection';
      return;
    }
    
    // Test API connection
    const url = `https://api.zotero.org/${libraryType}s/${libraryId}/items?limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'Zotero-API-Key': result.zoteroApiKey,
        'Zotero-API-Version': '3'
      }
    });
    
    if (response.ok) {
      // Save last tested time
      await chrome.storage.local.set({
        zoteroLastTested: new Date().toISOString()
      });
      
      showStatus('✅ Connection successful! Your Zotero API is working.', 'success');
      updateStatusDisplay();
    } else if (response.status === 403) {
      showStatus('❌ Invalid API key or insufficient permissions', 'error');
    } else if (response.status === 404) {
      showStatus('❌ Library not found. Check your User/Group ID.', 'error');
    } else {
      showStatus(`❌ Connection failed: ${response.status} ${response.statusText}`, 'error');
    }
  } catch (error) {
    console.error('Connection test error:', error);
    showStatus('❌ Connection error: ' + error.message, 'error');
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = 'Test Connection';
  }
}

// Clear Settings
async function clearSettings() {
  if (!confirm('Are you sure you want to clear all Zotero API settings?')) {
    return;
  }
  
  try {
    await chrome.storage.local.remove([
      'zoteroApiKey',
      'zoteroLibraryType',
      'zoteroUserId',
      'zoteroGroupId',
      'zoteroAutoCreateCollections',
      'zoteroDuplicateHandling',
      'zoteroLastTested'
    ]);
    
    // Reset form
    apiKeyInput.value = '';
    libraryTypeSelect.value = 'user';
    userIdInput.value = '';
    groupIdInput.value = '';
    autoCreateCheckbox.checked = true;
    duplicateHandlingSelect.value = 'skip';
    handleLibraryTypeChange();
    
    showStatus('✅ Settings cleared successfully', 'success');
    updateStatusDisplay();
  } catch (error) {
    console.error('Error clearing settings:', error);
    showStatus('❌ Error clearing settings', 'error');
  }
}

// Update Status Display
async function updateStatusDisplay() {
  try {
    const result = await chrome.storage.local.get([
      'zoteroApiKey',
      'zoteroLibraryType',
      'zoteroUserId',
      'zoteroGroupId',
      'zoteroAutoCreateCollections',
      'zoteroLastTested'
    ]);
    
    const apiConfigured = document.getElementById('apiConfigured');
    const currentLibraryType = document.getElementById('currentLibraryType');
    const currentLibraryId = document.getElementById('currentLibraryId');
    const currentAutoCreate = document.getElementById('currentAutoCreate');
    const lastTested = document.getElementById('lastTested');
    
    // API Configured
    if (result.zoteroApiKey) {
      apiConfigured.textContent = '✅ Configured';
      apiConfigured.className = 'status-yes';
    } else {
      apiConfigured.textContent = '❌ Not configured';
      apiConfigured.className = 'status-no';
    }
    
    // Library Type
    if (result.zoteroLibraryType) {
      currentLibraryType.textContent = result.zoteroLibraryType === 'user' ? 'Personal Library' : 'Group Library';
    } else {
      currentLibraryType.textContent = '—';
    }
    
    // Library ID
    const libraryId = result.zoteroLibraryType === 'user' ? result.zoteroUserId : result.zoteroGroupId;
    currentLibraryId.textContent = libraryId || '—';
    
    // Auto-create Collections
    currentAutoCreate.textContent = result.zoteroAutoCreateCollections !== false ? 'Yes' : 'No';
    
    // Last Tested
    if (result.zoteroLastTested) {
      const date = new Date(result.zoteroLastTested);
      lastTested.textContent = date.toLocaleString();
    } else {
      lastTested.textContent = 'Never';
    }
  } catch (error) {
    console.error('Error updating status display:', error);
  }
}

// Show Status Message
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  
  // Auto-hide after 5 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 5000);
  }
}
