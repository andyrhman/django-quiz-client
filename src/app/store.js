import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../services/authSlice'
import { attachStore } from '../api/axios'

const store = configureStore({
  reducer: {
    auth: authReducer
  }
})

attachStore(store)

export default store
