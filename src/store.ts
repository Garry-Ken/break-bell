import { load, type Store } from '@tauri-apps/plugin-store'
import { DEFAULT_CONFIG, type Config } from './types'
import { inTauri } from './lib/ipc'

const STORE_FILE = 'config.json'
const KEY = 'config'
const LS_KEY = 'break-bell.config'

let storePromise: Promise<Store> | null = null
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE)
  return storePromise
}

/** 合并默认值，容忍旧版本缺字段。 */
function normalize(partial: Partial<Config> | null | undefined): Config {
  return { ...DEFAULT_CONFIG, ...(partial ?? {}) }
}

export async function loadConfig(): Promise<Config> {
  try {
    if (inTauri) {
      const store = await getStore()
      const saved = await store.get<Config>(KEY)
      return normalize(saved)
    }
    const raw = localStorage.getItem(LS_KEY)
    return normalize(raw ? JSON.parse(raw) : null)
  } catch (e) {
    console.warn('loadConfig failed, using defaults', e)
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    if (inTauri) {
      const store = await getStore()
      await store.set(KEY, config)
      await store.save()
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(config))
    }
  } catch (e) {
    console.warn('saveConfig failed', e)
  }
}
