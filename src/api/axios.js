import axios from 'axios'

// We'll attach the store from store.js after store is created.
let storeRef = null
export const attachStore = (store) => { storeRef = store }

// Base URL (adjust if you use VITE env var)
const API_BASE = import.meta.env.VITE_API_URL
const USER_PREFIX = '/api/user'

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, response) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error)
    else prom.resolve(response)
  })
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const originalReq = err.config
    if (!originalReq) return Promise.reject(err)

    if (err.response && err.response.status === 401 && !originalReq._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => api(originalReq))
      }

      originalReq._retry = true
      isRefreshing = true

      try {
        // call refresh endpoint (user scope)
        await api.post(`${USER_PREFIX}/auth/refresh/`)
        processQueue(null, null)
        isRefreshing = false
        return api(originalReq)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        isRefreshing = false

        // dispatch logout using attached store if available.
        if (storeRef && storeRef.dispatch) {
          try {
            // dynamic import the thunk to avoid circular static imports
            const mod = await import('../services/authSlice.js')
            if (mod && mod.logout) {
              storeRef.dispatch(mod.logout())
            } else {
              // fallback: dispatch a plain action to clear state
              storeRef.dispatch({ type: 'auth/forceLogout' })
            }
          } catch (e) {
            // swallow errors to avoid hiding the original refresh error
            console.error('Failed to dispatch logout from axios interceptor', e)
          }
        }

        return Promise.reject(refreshErr)
      }
    }

    return Promise.reject(err)
  }
)

export default api
