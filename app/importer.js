/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'strict mode'

const electron = require('electron')
const app = electron.app
const importer = electron.importer
const dialog = electron.dialog
const BrowserWindow = electron.BrowserWindow
const session = electron.session
const siteUtil = require('../js/state/siteUtil')
const AppStore = require('../js/stores/appStore')
const siteTags = require('../js/constants/siteTags')
const appActions = require('../js/actions/appActions')
const messages = require('../js/constants/messages')
const settings = require('../js/constants/settings')
const getSetting = require('../js/settings').getSetting
const locale = require('./locale')
const tabMessageBox = require('./browser/tabMessageBox')
const {makeImmutable} = require('./common/state/immutableUtil')
const tabState = require('./common/state/tabState')

var isImportingBookmarks = false
var hasBookmarks
var importedSites

exports.init = () => {
  importer.initialize()
}

exports.importData = (selected) => {
  if (selected.get('favorites')) {
    isImportingBookmarks = true
    const sites = AppStore.getState().get('sites')
    hasBookmarks = sites.find(
      (site) => siteUtil.isBookmark(site) || siteUtil.isFolder(site)
    )
  }
  if (selected !== undefined) {
    importer.importData(selected.toJS())
  }
}

exports.importHTML = (selected) => {
  isImportingBookmarks = true
  const sites = AppStore.getState().get('sites')
  hasBookmarks = sites.find(
    (site) => siteUtil.isBookmark(site) || siteUtil.isFolder(site)
  )
  const files = dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{
      name: 'HTML',
      extensions: ['html', 'htm']
    }]
  })
  if (files && files.length > 0) {
    const file = files[0]
    importer.importHTML(file)
  }
}

importer.on('update-supported-browsers', (e, detail) => {
  isImportingBookmarks = false
  if (BrowserWindow.getFocusedWindow()) {
    BrowserWindow.getFocusedWindow().webContents.send(messages.IMPORTER_LIST, detail)
  }
})

importer.on('add-history-page', (e, history, visitSource) => {
  let sites = []
  for (let i = 0; i < history.length; ++i) {
    const site = {
      title: history[i].title,
      location: history[i].url,
      lastAccessedTime: history[i].last_visit * 1000
    }
    sites.push(site)
  }
  appActions.addSite(makeImmutable(sites))
})

importer.on('add-homepage', (e, detail) => {
})

const getParentFolderId = (path, pathMap, sites, topLevelFolderId, nextFolderIdObject) => {
  const pathLen = path.length
  if (!pathLen) {
    return topLevelFolderId
  }
  const parentFolder = path.pop()
  let parentFolderId = pathMap[parentFolder]
  if (parentFolderId === undefined) {
    parentFolderId = nextFolderIdObject.id++
    pathMap[parentFolder] = parentFolderId
    const folder = {
      customTitle: parentFolder,
      folderId: parentFolderId,
      parentFolderId: getParentFolderId(path, pathMap, sites, topLevelFolderId, nextFolderIdObject),
      lastAccessedTime: 0,
      creationTime: (new Date()).getTime(),
      tags: [siteTags.BOOKMARK_FOLDER]
    }
    sites.push(folder)
  }
  return parentFolderId
}

importer.on('add-bookmarks', (e, bookmarks, topLevelFolder) => {
  let nextFolderId = siteUtil.getNextFolderId(AppStore.getState().get('sites'))
  let nextFolderIdObject = { id: nextFolderId }
  let pathMap = {}
  let sites = []
  let topLevelFolderId = 0
  topLevelFolderId = nextFolderIdObject.id++
  sites.push({
    customTitle: siteUtil.getNextFolderName(AppStore.getState().get('sites'), topLevelFolder),
    folderId: topLevelFolderId,
    parentFolderId: 0,
    lastAccessedTime: 0,
    creationTime: (new Date()).getTime(),
    tags: [siteTags.BOOKMARK_FOLDER]
  })
  for (let i = 0; i < bookmarks.length; ++i) {
    let path = bookmarks[i].path
    let parentFolderId = getParentFolderId(path, pathMap, sites, topLevelFolderId, nextFolderIdObject)
    if (bookmarks[i].is_folder) {
      const folderId = nextFolderIdObject.id++
      pathMap[bookmarks[i].title] = folderId
      const folder = {
        customTitle: bookmarks[i].title,
        folderId: folderId,
        parentFolderId: parentFolderId,
        lastAccessedTime: 0,
        creationTime: bookmarks[i].creation_time * 1000,
        tags: [siteTags.BOOKMARK_FOLDER]
      }
      sites.push(folder)
    } else {
      const site = {
        title: bookmarks[i].title,
        customTitle: bookmarks[i].title,
        location: bookmarks[i].url,
        parentFolderId: parentFolderId,
        lastAccessedTime: 0,
        creationTime: bookmarks[i].creation_time * 1000,
        tags: [siteTags.BOOKMARK]
      }
      sites.push(site)
    }
  }
  importedSites = makeImmutable(sites)
  appActions.addSite(makeImmutable(sites))
})

importer.on('add-favicons', (e, detail) => {
  let faviconMap = {}
  detail.forEach((entry) => {
    if (entry.favicon_url.includes('made-up-favicon')) {
      for (let url of entry.urls) {
        faviconMap[url] = entry.png_data
      }
    } else {
      for (let url of entry.urls) {
        faviconMap[url] = entry.favicon_url
      }
    }
  })
  let sites = importedSites
  sites = sites.map((site) => {
    if ((site.get('favicon') === undefined && site.get('location') !== undefined &&
      faviconMap[site.get('location')] !== undefined) ||
      (site.get('favicon') !== undefined && site.get('favicon').includes('made-up-favicon'))) {
      return site.set('favicon', faviconMap[site.get('location')])
    } else {
      return site
    }
  })
  appActions.addSite(sites)
})

importer.on('add-keywords', (e, templateUrls, uniqueOnHostAndPath) => {
})

importer.on('add-autofill-form-data-entries', (e, detail) => {
})

importer.on('add-cookies', (e, cookies) => {
  for (let i = 0; i < cookies.length; ++i) {
    const cookie = {
      url: cookies[i].url,
      name: cookies[i].name,
      value: cookies[i].value,
      domain: cookies[i].domain,
      path: cookies[i].path,
      secure: cookies[i].secure,
      httpOnly: cookies[i].httponly,
      expirationDate: cookies[i].expiry_date
    }
    session.defaultSession.cookies.set(cookie, (error) => {
      if (error) {
        console.error(error)
      }
    })
  }
})

const getActiveTabId = () => {
  return tabState.getActiveTabId(AppStore.getState())
}

const showImportWarning = function () {
  const tabId = getActiveTabId()
  if (tabId) {
    tabMessageBox.show(tabId, {
      message: `${locale.translation('closeFirefoxWarning')}`,
      title: 'Brave',
      buttons: [locale.translation('closeFirefoxWarningOk')]
    })
  }
}

const showImportSuccess = function () {
  const tabId = getActiveTabId()
  if (tabId) {
    tabMessageBox.show(tabId, {
      message: `${locale.translation('importSuccess')}`,
      title: 'Brave',
      buttons: [locale.translation('importSuccessOk')]
    })
  }
}

app.on('show-warning-dialog', (e) => {
  showImportWarning()
})

importer.on('import-success', (e) => {
  if (isImportingBookmarks) {
    const showBookmarksToolbar = getSetting(settings.SHOW_BOOKMARKS_TOOLBAR)
    if (!showBookmarksToolbar && !hasBookmarks) {
      appActions.changeSetting(settings.SHOW_BOOKMARKS_TOOLBAR, true)
    }
  }
  showImportSuccess()
})

importer.on('import-dismiss', (e) => {
})
