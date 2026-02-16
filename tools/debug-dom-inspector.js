// NotebookLM DOM Inspector - Run this in Chrome DevTools Console
// This will show you the actual HTML structure of your sources

console.log('🔍 NotebookLM DOM Inspector Starting...');

// Function to inspect source elements
function inspectNotebookLM() {
  console.log('\n=== SEARCHING FOR SOURCES ===\n');
  
  // Strategy 1: Look for common container patterns
  const containers = [
    document.querySelector('[aria-label*="ource"]'),
    document.querySelector('[aria-label*="Source"]'),
    document.querySelector('[class*="source"]'),
    document.querySelector('aside'),
    document.querySelector('[role="complementary"]'),
    document.querySelector('nav')
  ].filter(Boolean);
  
  console.log(`Found ${containers.length} potential container(s)`);
  
  containers.forEach((container, i) => {
    console.log(`\nContainer ${i + 1}:`, container);
    console.log('  Classes:', container.className);
    console.log('  ID:', container.id);
    console.log('  ARIA:', container.getAttribute('aria-label'));
  });
  
  // Strategy 2: Look for list items
  const lists = document.querySelectorAll('[role="list"], ul, ol');
  console.log(`\n\nFound ${lists.length} list(s)`);
  
  lists.forEach((list, i) => {
    const items = list.querySelectorAll('[role="listitem"], li');
    if (items.length > 0) {
      console.log(`\nList ${i + 1}: ${items.length} items`);
      console.log('  List classes:', list.className);
      
      // Inspect first 3 items
      items.forEach((item, j) => {
        if (j < 3) {
          console.log(`\n  Item ${j + 1}:`);
          console.log('    Text:', item.textContent.substring(0, 100));
          console.log('    Classes:', item.className);
          console.log('    HTML:', item.innerHTML.substring(0, 200));
          
          // Look for title elements
          const possibleTitles = item.querySelectorAll('h1, h2, h3, h4, span, div, p');
          console.log(`    Found ${possibleTitles.length} possible title elements`);
          
          possibleTitles.forEach((el, k) => {
            if (k < 3 && el.textContent.trim().length > 0) {
              console.log(`      Element ${k + 1}: "${el.textContent.trim().substring(0, 60)}..."`);
              console.log(`        Tag: ${el.tagName}, Classes: ${el.className}`);
            }
          });
        }
      });
    }
  });
  
  // Strategy 3: Look for buttons/links that might be sources
  console.log('\n\n=== LOOKING FOR CLICKABLE ELEMENTS ===\n');
  
  const clickables = document.querySelectorAll('button, [role="button"], a');
  let sourceCount = 0;
  
  clickables.forEach((el, i) => {
    const text = el.textContent.trim();
    // Filter for elements that look like source titles
    if (text.length > 10 && text.length < 300 && !text.includes('\n\n')) {
      if (sourceCount < 5) {
        console.log(`\nPotential Source ${sourceCount + 1}:`);
        console.log('  Text:', text.substring(0, 100));
        console.log('  Tag:', el.tagName);
        console.log('  Classes:', el.className);
        console.log('  Parent:', el.parentElement?.className);
        console.log('  Has icon:', !!el.querySelector('svg, [class*="icon"]'));
        
        // Check for PDF indicator
        const htmlLower = el.innerHTML.toLowerCase();
        if (htmlLower.includes('pdf')) {
          console.log('  ⚠️ Contains "PDF"');
        }
        if (htmlLower.includes('drive')) {
          console.log('  ⚠️ Contains "drive"');
        }
      }
      sourceCount++;
    }
  });
  
  console.log(`\nTotal clickable elements that look like sources: ${sourceCount}`);
  
  // Strategy 4: Look for specific NotebookLM patterns
  console.log('\n\n=== NOTEBOOKLM-SPECIFIC PATTERNS ===\n');
  
  // Check for Material Design components
  const materialElements = document.querySelectorAll('[class*="mat-"], [class*="mdc-"]');
  console.log(`Found ${materialElements.length} Material Design elements`);
  
  // Check for source-related attributes
  const withDataAttrs = document.querySelectorAll('[data-source], [data-source-id], [data-source-type]');
  console.log(`Found ${withDataAttrs.length} elements with source data attributes`);
  
  if (withDataAttrs.length > 0) {
    console.log('\nData attributes found:');
    withDataAttrs.forEach((el, i) => {
      if (i < 3) {
        console.log(`  ${i + 1}. source-id:`, el.getAttribute('data-source-id'));
        console.log(`     source-type:`, el.getAttribute('data-source-type'));
        console.log(`     text:`, el.textContent.substring(0, 60));
      }
    });
  }
  
  // Strategy 5: Get all text content and look for patterns
  console.log('\n\n=== PAGE TEXT ANALYSIS ===\n');
  
  const bodyText = document.body.innerText;
  const pdfMatches = bodyText.match(/\.pdf/gi);
  const driveMatches = bodyText.match(/drive/gi);
  
  console.log(`PDF mentions: ${pdfMatches?.length || 0}`);
  console.log(`Drive mentions: ${driveMatches?.length || 0}`);
  
  console.log('\n\n=== RECOMMENDATIONS ===\n');
  console.log('Look at the console output above and identify:');
  console.log('1. Which list contains your sources?');
  console.log('2. What classes do the source items have?');
  console.log('3. What element contains the actual title?');
  console.log('4. Are there any data attributes we can use?');
  console.log('\nThen share this information to update the extension!');
}

// Run the inspector
inspectNotebookLM();

// Also create a helper to manually select an element
console.log('\n\n💡 TIP: Right-click a source in NotebookLM → Inspect Element');
console.log('Then in console, type: $0');
console.log('This will show you the exact element structure!');
