/**
 * Settings Page Logic
 * Handles Zotero API configuration
 */

// DOM Elements
const form = document.getElementById('settingsForm');
const apiKeyInput = document.getElementById('apiKey');
const userIDInput = document.getElementById('userID');
const libraryTypeSelect = document.getElementById('libraryType');
const testBtn = document.getElementById('testBtn');
const closeBtn = document.getElementById('closeBtn');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const statusDiv = document.getElementById('status');

// Load saved settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await getZoteroSettings();
  
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }
  
  if (settings.userID) {
    userIDInput.value = settings.userID;
  }
  
  if (settings.libraryType) {
    libraryTypeSelect.value = settings.libraryType;
  }
});

// Toggle API key visibility
toggleApiKeyBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleApiKeyBtn.textContent = 'Hide';
  } else {
    apiKeyInput.type = 'password';
    toggleApiKeyBtn.textContent = 'Show';
  }
});

// Test connection
testBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const userID = userIDInput.value.trim();
  const libraryType = libraryTypeSelect.value;
  
  if (!apiKey || !userID) {
    showStatus('Please fill in both API Key and User ID', 'error');
    return;
  }
  
  showStatus('Testing connection...', 'info');
  testBtn.disabled = true;
  testBtn.textContent = '⏳ Testing...';
  
  try {
    const api = new ZoteroAPI(apiKey, userID, libraryType);
    const result = await api.testConnection();
    
    if (result.success) {
      showStatus('✓ Connection successful! Your Zotero API is working correctly.', 'success');
    } else {
      showStatus(`✗ Connection failed: ${result.message}`, 'error');
    }
  } catch (error) {
    showStatus(`✗ Error: ${error.message}`, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '🔗 Test Connection';
  }
});

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const apiKey = apiKeyInput.value.trim();
  const userID = userIDInput.value.trim();
  const libraryType = libraryTypeSelect.value;
  
  if (!apiKey || !userID) {
    showStatus('Please fill in all required fields', 'error');
    return;
  }
  
  // Validate User ID is numeric
  if (!/^\d+$/.test(userID)) {
    showStatus('User ID must be a number (e.g., 123456)', 'error');
    return;
  }
  
  showStatus('Saving settings...', 'info');
  
  try {
    await saveZoteroSettings(apiKey, userID, libraryType);
    showStatus('✓ Settings saved successfully! You can now use "Export to Zotero" feature.', 'success');
    
    // Auto-close after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);
  } catch (error) {
    showStatus(`✗ Error saving settings: ${error.message}`, 'error');
  }
});

// Close settings
closeBtn.addEventListener('click', () => {
  window.close();
});

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = type;
  statusDiv.style.display = 'block';
  
  // Auto-hide info messages after 5 seconds
  if (type === 'info') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }
}
