'use strict';

var tabs;
var timeIntervalList;
var currentTab;
var isNeedDeleteTimeIntervalFromTabs = false;
var activity = new Activity();
var storage = new LocalStorage();

var setting_black_list;
var setting_restriction_list;
var setting_interval_save;
var setting_interval_inactivity;
var setting_view_in_badge;
var setting_notification_list;
var setting_notification_message;

var isHasPermissioForNotification;

function updateSummaryTime() {
    setInterval(backgroundCheck, SETTINGS_INTERVAL_CHECK_DEFAULT);
}

function updateStorage() {
    setInterval(backgroundUpdateStorage, SETTINGS_INTERVAL_SAVE_STORAGE_DEFAULT);
}

function backgroundCheck() {
    chrome.windows.getLastFocused({ populate: true }, function (currentWindow) {
        if (currentWindow.focused) {
            var activeTab = currentWindow.tabs.find(t => t.active === true);
            if (activeTab !== undefined && activity.isValidPage(activeTab)) {
                var activeUrl = activity.extractHostname(activeTab.url);
                var tab = activity.getTab(activeUrl);
                if (tab === undefined) {
                    activity.addTab(activeTab);
                }

                if (activity.isInignorlist(activeUrl)) {
                    chrome.browserAction.setBadgeBackgroundColor({ color: '#FF0000' })
                    chrome.browserAction.setBadgeText({
                        tabId: activeTab.id,
                        text: 'N. A.'
                    });
                } else {
                    if (tab !== undefined) {
                        if (currentTab !== tab.url) {
                            activity.setCurrentActiveTab(tab.url);
                        }
                        chrome.idle.queryState(parseInt(setting_interval_inactivity), function (state) {
                            if (state === 'active') {
                                mainTRacker(activeUrl, tab, activeTab);
                            }/* else checkDOM(state, activeUrl, tab, activeTab);*/
                        });
                    }
                }
            }
        } else activity.closeIntervalForCurrentTab();
    });
}

function mainTRacker(activeUrl, tab, activeTab) {
    if (activity.isLimitExceeded(activeUrl, tab)) {
        setBlockPageToCurrent(activeUrl);
    }
    if (!activity.isInignorlist(activeUrl)) {
        if (activity.isNeedNotifyView(activeUrl, tab)) {
            if (isHasPermissioForNotification) {
                showNotification(activeUrl, tab);
            } else {
                checkPermissionsForNotifications(showNotification, activeUrl, tab);
            }
        }
        tab.incSummaryTime();
    }
    if (setting_view_in_badge === true) {
        chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 0, 0] })
        var today = new Date().toLocaleDateString("en-US");
        var summary = tab.days.find(s => s.date === today).summary;
        chrome.browserAction.setBadgeText({
            tabId: activeTab.id,
            text: String(convertSummaryTimeToBadgeString(summary))
        });
    } else {
        chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 0, 0] })
        chrome.browserAction.setBadgeText({
            tabId: activeTab.id,
            text: ''
        });
    }
}

function showNotification(activeUrl, tab) {
    chrome.notifications.clear('watt-site-notification', function (wasCleared) {
        if (!wasCleared) {
            console.log('!wasCleared');

            chrome.notifications.create(
                'watt-site-notification', {
                type: 'basic',
                iconUrl: 'icons/clock128px.png',
                title: "Time SetUp Says",
                contextMessage: activeUrl + ' ' + convertShortSummaryTimeToString(tab.getTodayTime()),
                message: setting_notification_message
            },
                function (notificationId) {
                    console.log(notificationId);
                    chrome.notifications.clear('watt-site-notification', function (wasCleared) {
                        if (wasCleared)
                            notificationAction(activeUrl, tab);
                    });
                });
        } else {
            notificationAction(activeUrl, tab);
        }
    });
}

function notificationAction(activeUrl, tab) {
    chrome.notifications.create(
        'watt-site-notification', {
        type: 'basic',
        iconUrl: 'icons/clock128px.png',
        title: "Time SetUp Says",
        contextMessage: activeUrl + ' ' + convertShortSummaryTimeToString(tab.getTodayTime()),
        message: setting_notification_message
    });
}

function setBlockPageToCurrent(activeUrl) {
    var blockUrl = chrome.runtime.getURL("control.html") + '?url=' + activeUrl;
    chrome.tabs.query({ currentWindow: true, active: true }, function (tab) {
        chrome.tabs.update(tab.id, { url: blockUrl });
    });
}


function backgroundUpdateStorage() {
    if (tabs != undefined && tabs.length > 0)
        storage.saveTabs(tabs);
    if (timeIntervalList != undefined && timeIntervalList.length > 0)
        storage.saveValue(STORAGE_TIMEINTERVAL_LIST, timeIntervalList);
}

function setDefaultSettings() {
    storage.saveValue(SETTINGS_INTERVAL_INACTIVITY, SETTINGS_INTERVAL_INACTIVITY_DEFAULT);
    storage.saveValue(SETTINGS_INTERVAL_RANGE, SETTINGS_INTERVAL_RANGE_DEFAULT);
    storage.saveValue(SETTINGS_VIEW_TIME_IN_BADGE, SETTINGS_VIEW_TIME_IN_BADGE_DEFAULT);
    storage.saveValue(SETTINGS_INTERVAL_SAVE_STORAGE, SETTINGS_INTERVAL_SAVE_STORAGE_DEFAULT);
    storage.saveValue(STORAGE_NOTIFICATION_MESSAGE, STORAGE_NOTIFICATION_MESSAGE_DEFAULT);
}

function checkSettingsImEmpty() {
    chrome.storage.local.getBytesInUse(['inactivity_interval'], function (item) {
        if (item == 0) {
            setDefaultSettings();
        }
    });
}

function setDefaultValueForNewSettings() {
    loadNotificationMessage();
}

function addListener() {
    chrome.tabs.onActivated.addListener(function (info) {
        chrome.tabs.get(info.tabId, function (tab) {
            activity.addTab(tab);
        });
    });

    chrome.webNavigation.onCompleted.addListener(function (details) {
        chrome.tabs.get(details.tabId, function (tab) {
            activity.updateFavicon(tab);
        });
    });
    chrome.runtime.onInstalled.addListener(function (details) {
        if (details.reason == 'install') {
            storage.saveValue(SETTINGS_SHOW_HINT, SETTINGS_SHOW_HINT_DEFAULT);
            setDefaultSettings();
        }
        if (details.reason == 'update') {
            storage.saveValue(SETTINGS_SHOW_HINT, SETTINGS_SHOW_HINT_DEFAULT);
            checkSettingsImEmpty();
            setDefaultValueForNewSettings();
            isNeedDeleteTimeIntervalFromTabs = true;
        }
    });
    chrome.storage.onChanged.addListener(function (changes, namespace) {
        for (var key in changes) {
            if (key === STORAGE_BLACK_LIST) {
                loadignorlist();
            }
            if (key === STORAGE_RESTRICTION_LIST) {
                loadRestrictionList();
            }
            if (key === STORAGE_NOTIFICATION_LIST) {
                loadNotificationList();
            }
            if (key === STORAGE_NOTIFICATION_MESSAGE) {
                loadNotificationMessage();
            }
            if (key === SETTINGS_INTERVAL_INACTIVITY) {
                storage.getValue(SETTINGS_INTERVAL_INACTIVITY, function (item) { setting_interval_inactivity = item; });
            }
            if (key === SETTINGS_VIEW_TIME_IN_BADGE) {
                storage.getValue(SETTINGS_VIEW_TIME_IN_BADGE, function (item) { setting_view_in_badge = item; });
            }
        }
    });

    chrome.runtime.setUninstallURL("https://docs.google.com/forms/d/e/1FAIpQLSflgDcrH-LKfolR8Gq2lJq7s3Q-tXzkN1Gg2GJFh__KeqJJDQ/viewform");
}

function loadTabs() {
    storage.loadTabs(STORAGE_TABS, function (items) {
        tabs = [];
        if (items != undefined) {
            for (var i = 0; i < items.length; i++) {
                tabs.push(new Tab(items[i].url, items[i].favicon, items[i].days, items[i].summaryTime, items[i].counter));
            }
            if (isNeedDeleteTimeIntervalFromTabs)
                deleteTimeIntervalFromTabs();
        }
    });
}

function deleteTimeIntervalFromTabs() {
    tabs.forEach(function (item) {
        item.days.forEach(function (day) {
            if (day.time != undefined)
                day.time = [];
        })
    })
}

function deleteYesterdayTimeInterval() {
    timeIntervalList = timeIntervalList.filter(x => x.day == new Date().toLocaleDateString("en-US"));
}

function loadignorlist() {
    storage.getValue(STORAGE_BLACK_LIST, function (items) {
        setting_black_list = items;
    })
}

function loadTimeIntervals() {
    storage.getValue(STORAGE_TIMEINTERVAL_LIST, function (items) {
        timeIntervalList = [];
        if (items != undefined) {
            for (var i = 0; i < items.length; i++) {
                timeIntervalList.push(new TimeInterval(items[i].day, items[i].domain, items[i].intervals));
            }
            deleteYesterdayTimeInterval();
        }
    });
}

function loadRestrictionList() {
    storage.getValue(STORAGE_RESTRICTION_LIST, function (items) {
        setting_restriction_list = items;
    })
}

function loadNotificationList() {
    storage.getValue(STORAGE_NOTIFICATION_LIST, function (items) {
        setting_notification_list = items;
    });
}

function loadNotificationMessage() {
    storage.getValue(STORAGE_NOTIFICATION_MESSAGE, function (item) {
        setting_notification_message = item;
        if (isEmpty(setting_notification_message)) {
            storage.saveValue(STORAGE_NOTIFICATION_MESSAGE, STORAGE_NOTIFICATION_MESSAGE_DEFAULT);
            setting_notification_message = STORAGE_NOTIFICATION_MESSAGE_DEFAULT;
        }
    });
}

function loadSettings() {
    storage.getValue(SETTINGS_INTERVAL_INACTIVITY, function (item) { setting_interval_inactivity = item; });
    storage.getValue(SETTINGS_VIEW_TIME_IN_BADGE, function (item) { setting_view_in_badge = item; });
}

function loadAddDataFromStorage() {
    loadTabs();
    loadTimeIntervals();
    loadignorlist();
    loadRestrictionList();
    loadNotificationList();
    loadNotificationMessage();
    loadSettings();
}

function checkPermissionsForNotifications(callback, ...props) {
    chrome.permissions.contains({
        permissions: ["notifications"]
    }, function (result) {
        if (callback != undefined && result)
            callback(...props);
        isHasPermissioForNotification = result;
    });
}
// rest notification
var alarm = chrome.alarms.create("myAlarm", { delayInMinutes: 10.0, periodInMinutes: 10.0 });
chrome.alarms.onAlarm.addListener(function (alarm) {
    chrome.notifications.clear('take-a-break-notification');
    var notification = chrome.notifications.create(
        'take-a-break-notification', {
        type: 'basic',
        iconUrl: "icons/clock32px.png",
        title: 'Time SetUP Says',
        message: 'Take a break! Look away from your computer screen and focus on a spot 20 feet away for 50 seconds.'
    },
    );
});
// var alarm2= chrome.alarms.create("myAlarm2", { delayInMinutes: 200.0, periodInMinutes:10000.0 });

// chrome.alarms.onAlarm.addListener( function(alarm2) {
//   chrome.notifications.clear('take-a-break-notification2');

//   var notification2 = chrome.notifications.create(
//     'take-a-break-notification2', {
//       type: 'basic',
//       iconUrl: "icons/clock32px.png", 
//       title: 'Time SetUP Says',
//       message: 'You need to take a long break.It is bad for your health.'
//     },
//   );
// });
//end of the rest notification
addListener();
loadAddDataFromStorage();
updateSummaryTime();
updateStorage();