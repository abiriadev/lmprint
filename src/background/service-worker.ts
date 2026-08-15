chrome.runtime.onInstalled.addListener(() => {
	chrome.action.setBadgeText({ text: '0' })
	chrome.action.setBadgeBackgroundColor({ color: '#166534' })
})
