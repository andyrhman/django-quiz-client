import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../api/axios'

const USER_PREFIX = 'user'

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
    try {
        await api.post(`${USER_PREFIX}/auth/login/`, credentials)
        const me = await api.get(`${USER_PREFIX}/me/`)
        return me.data
    } catch (err) {
        return rejectWithValue(err.response?.data || { message: err.message })
    }
})

export const register = createAsyncThunk('auth/register', async (payload, { rejectWithValue }) => {
    try {
        const res = await api.post(`${USER_PREFIX}/auth/register/`, payload)
        return res.data
    } catch (err) {
        return rejectWithValue(err.response?.data || { message: err.message })
    }
})

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
    try {
        const res = await api.get(`${USER_PREFIX}/me/`)
        return res.data
    } catch (err) {
        console.warn('fetchMe: failed', err.response?.status, err.response?.data)
        return rejectWithValue(err.response?.data || { message: err.message })
    }
})


export const logout = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
    try {
        await api.post(`${USER_PREFIX}/auth/logout/`)
        return true
    } catch (err) {
        return rejectWithValue(err.response?.data || { message: err.message })
    }
})

const initialState = {
    user: null,
    loginLoading: false,
    registerLoading: false,
    fetchMeLoading: false,
    initialized: false,
    // per-action errors/messages
    loginError: null,
    registerError: null,
    fetchMeError: null,
    loginMessage: null,
    registerMessage: null
}

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        clearLoginError(state) { state.loginError = null; state.loginMessage = null },
        clearRegisterError(state) { state.registerError = null; state.registerMessage = null },
        clearFetchMeError(state) { state.fetchMeError = null },
        setInitialized(state, action) {
            state.initialized = action?.payload === undefined ? true : !!action.payload
        },

        forceLogout(state) {
            state.user = null
            state.loginLoading = false
            state.registerLoading = false
            state.fetchMeLoading = false
            state.initialized = true
            state.loginError = null
            state.registerError = null
            state.fetchMeError = null
            state.loginMessage = null
            state.registerMessage = null
        }
    },
    extraReducers: builder => {
        builder
            // LOGIN
            .addCase(login.pending, state => {
                state.loginLoading = true; state.loginError = null; state.loginMessage = null
            })
            .addCase(login.fulfilled, (state, action) => {
                state.loginLoading = false; state.user = action.payload; state.loginError = null
            })
            .addCase(login.rejected, (state, action) => {
                state.loginLoading = false; state.loginError = action.payload
            })

            // REGISTER
            .addCase(register.pending, state => {
                state.registerLoading = true; state.registerError = null; state.registerMessage = null
            })
            .addCase(register.fulfilled, (state, action) => {
                state.registerLoading = false; state.registerMessage = action.payload || { message: 'Account created' }; state.registerError = null
            })
            .addCase(register.rejected, (state, action) => {
                state.registerLoading = false; state.registerError = action.payload
            })

            // FETCH ME
            .addCase(fetchMe.pending, state => {
                state.fetchMeLoading = true; state.fetchMeError = null; state.initialized = false
            })
            .addCase(fetchMe.fulfilled, (state, action) => {
                state.fetchMeLoading = false; state.user = action.payload; state.fetchMeError = null; state.initialized = true
            })
            .addCase(fetchMe.rejected, (state, action) => {
                state.fetchMeLoading = false; state.user = null; state.fetchMeError = action.payload; state.initialized = true
            })

            // LOGOUT
            .addCase(logout.fulfilled, state => {
                state.user = null; state.loginLoading = false; state.registerLoading = false; state.fetchMeLoading = false; state.loginError = null; state.registerError = null; state.fetchMeError = null; state.initialized = true
            })
            .addCase(logout.rejected, state => {
                state.user = null; state.loginLoading = false; state.registerLoading = false; state.fetchMeLoading = false; state.initialized = true
            })
    }
})

export const { clearLoginError, clearRegisterError, clearFetchMeError, setInitialized, forceLogout } = authSlice.actions
export default authSlice.reducer