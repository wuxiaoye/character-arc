import { app, BrowserWindow, nativeTheme, screen, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type AssistantPromptPayload = {
  id: string
  prompt: string
  quickAction?: string
}

type AppWindowKind = 'main' | 'assistant'

type CreateWindowManagerOptions = {
  getLatestAssistantContext: () => unknown
  getLatestAssistantPrompt: () => AssistantPromptPayload | null
}

export type WindowManager = ReturnType<typeof createWindowManager>

const APP_DEFAULT_WIDTH = 1480
const APP_DEFAULT_HEIGHT = 920
const APP_MIN_WIDTH = 1120
const APP_MIN_HEIGHT = 720
const ASSISTANT_WINDOW_WIDTH = 580
const ASSISTANT_WINDOW_HEIGHT = 820
const ASSISTANT_WINDOW_MIN_WIDTH = 460
const ASSISTANT_WINDOW_MIN_HEIGHT = 620

export function createWindowManager(options: CreateWindowManagerOptions) {
  let mainWindow: BrowserWindow | null = null
  let assistantWindow: BrowserWindow | null = null

  function getMainWindowMetrics() {
    const { workAreaSize } = screen.getPrimaryDisplay()
    const compactScreen = workAreaSize.width <= 1366 || workAreaSize.height <= 820
    const minWidth = Math.min(APP_MIN_WIDTH, workAreaSize.width)
    const minHeight = Math.min(APP_MIN_HEIGHT, workAreaSize.height)
    const width = Math.min(Math.max(Math.round(workAreaSize.width * 0.9), minWidth), APP_DEFAULT_WIDTH)
    const height = Math.min(Math.max(Math.round(workAreaSize.height * 0.9), minHeight), APP_DEFAULT_HEIGHT)

    return {
      width,
      height,
      minWidth,
      minHeight,
      compactScreen
    }
  }

  function getWindowSearch(kind: AppWindowKind): string {
    return kind === 'assistant' ? '?window=assistant' : ''
  }

  function resolveWindowIconPath(): string | undefined {
    const packagedIconPath = join(process.resourcesPath, 'icon.png')
    if (existsSync(packagedIconPath)) {
      return packagedIconPath
    }

    const localIconPath = join(process.cwd(), 'resources/icon.png')
    if (existsSync(localIconPath)) {
      return localIconPath
    }

    return undefined
  }

  function loadRendererWindow(window: BrowserWindow, kind: AppWindowKind): void {
    const search = getWindowSearch(kind)

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${search}`)
      if (kind === 'main') {
        window.webContents.openDevTools({ mode: 'detach' })
      }
      return
    }

    const rendererHtml = join(__dirname, '../../out/renderer/index.html')
    console.log('[renderer] loadFile →', rendererHtml)
    void window.loadFile(rendererHtml, search ? { search } : undefined)
  }

  function sendWindowEvent(window: BrowserWindow | null, channel: string, payload: unknown): void {
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
      return
    }

    window.webContents.send(channel, payload)
  }

  function broadcastWindowEvent(channel: string, payload: unknown, exceptWebContentsId?: number): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) {
        continue
      }

      if (exceptWebContentsId && window.webContents.id === exceptWebContentsId) {
        continue
      }

      window.webContents.send(channel, payload)
    }
  }

  function emitAssistantWindowVisibility(visible: boolean): void {
    broadcastWindowEvent('characterarc:assistant-window-visibility', { visible })
  }

  function createMainWindow(): BrowserWindow {
    const { width, height, minWidth, minHeight, compactScreen } = getMainWindowMetrics()
    const windowIcon = resolveWindowIconPath()
    const window = new BrowserWindow({
      width,
      height,
      minWidth,
      minHeight,
      icon: windowIcon,
      frame: true,
      autoHideMenuBar: true,
      title: `弧光 v${app.getVersion()}`,
      backgroundColor: '#f5f5f7',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    window.once('ready-to-show', () => {
      if (compactScreen) {
        window.center()
      }
      window.show()
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    window.on('closed', () => {
      if (assistantWindow && !assistantWindow.isDestroyed()) {
        assistantWindow.close()
      }

      if (mainWindow === window) {
        mainWindow = null
      }
    })

    loadRendererWindow(window, 'main')
    mainWindow = window
    return window
  }

  function createAssistantWindow(): BrowserWindow {
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      if (assistantWindow.isMinimized()) {
        assistantWindow.restore()
      }
      assistantWindow.show()
      assistantWindow.focus()
      emitAssistantWindowVisibility(true)
      sendWindowEvent(assistantWindow, 'characterarc:assistant-context', options.getLatestAssistantContext())
      return assistantWindow
    }

    const parentBounds = mainWindow?.getBounds()
    const assistantX = parentBounds ? parentBounds.x + parentBounds.width - ASSISTANT_WINDOW_WIDTH - 32 : undefined
    const assistantY = parentBounds ? parentBounds.y + 44 : undefined
    const windowIcon = resolveWindowIconPath()

    const window = new BrowserWindow({
      width: ASSISTANT_WINDOW_WIDTH,
      height: ASSISTANT_WINDOW_HEIGHT,
      minWidth: ASSISTANT_WINDOW_MIN_WIDTH,
      minHeight: ASSISTANT_WINDOW_MIN_HEIGHT,
      icon: windowIcon,
      frame: true,
      x: assistantX,
      y: assistantY,
      parent: mainWindow ?? undefined,
      autoHideMenuBar: true,
      title: `character-arc v${app.getVersion()} - AI 创作助理`,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0e12' : '#f4f7fb',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    window.once('ready-to-show', () => {
      window.show()
      window.focus()
      emitAssistantWindowVisibility(true)
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    window.webContents.once('did-finish-load', () => {
      sendWindowEvent(window, 'characterarc:assistant-context', options.getLatestAssistantContext())
      const latestAssistantPrompt = options.getLatestAssistantPrompt()
      if (latestAssistantPrompt) {
        sendWindowEvent(window, 'characterarc:assistant-prompt', latestAssistantPrompt)
      }
    })

    window.on('closed', () => {
      if (assistantWindow === window) {
        assistantWindow = null
      }
      emitAssistantWindowVisibility(false)
    })

    loadRendererWindow(window, 'assistant')
    assistantWindow = window
    return window
  }

  function closeAssistantWindow(): void {
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      assistantWindow.close()
      return
    }

    emitAssistantWindowVisibility(false)
  }

  function isAssistantWindowVisible(): boolean {
    return Boolean(assistantWindow && !assistantWindow.isDestroyed())
  }

  function getActiveWindow(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  }

  function setTitleBarOverlay(options: { color: string; symbolColor: string }): void {
    if (process.platform !== 'win32') {
      return
    }
  }

  return {
    createMainWindow,
    createAssistantWindow,
    closeAssistantWindow,
    getMainWindow: () => mainWindow,
    getAssistantWindow: () => assistantWindow,
    getActiveWindow,
    isAssistantWindowVisible,
    sendWindowEvent,
    broadcastWindowEvent,
    emitAssistantWindowVisibility,
    setTitleBarOverlay
  }
}
