// Background Service Worker
// Handles background tasks and extension lifecycle events

console.log('NotebookLM to Zotero: Background service worker loaded');

// Installation handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
    // Could open welcome page or instructions here
    // chrome.tabs.create({ url: 'welcome.html' });
  } else if (details.reason === 'update') {
    console.log('Extension updated');
  }
});

// Handle extension icon click (optional - in case popup doesn't load)
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked', tab);
});

// Monitor download completion (optional - for user feedback)
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log('Download completed:', delta.id);
  }
});

// Error handler for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
