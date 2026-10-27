chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'tryon-garment', title: 'Try on this garment', contexts: ['image'] });
});
chrome.contextMenus.onClicked.addListener((info) => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') + '?garment=' + encodeURIComponent(info.srcUrl) });
});
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});
