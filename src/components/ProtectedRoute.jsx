import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'
import { Spinner } from 'react-bootstrap'
import { useState, useEffect } from 'react'

export default function ProtectedRoute({ children }) {
    const { initialized } = useSelector(state => state.auth)
    const [redirect, setRedirect] = useState(false)

    useEffect(() => {
        if (!initialized) {
            const timer = setTimeout(() => {
                setRedirect(true)
            }, 2000) // Wait for 2 seconds before redirecting
            return () => clearTimeout(timer) // Cleanup timeout on unmount
        }
    }, [initialized])

    // Show spinner while waiting for initialization
    if (!initialized && !redirect) {
        return (
            <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner animation="border" role="status" style={{ width: 48, height: 48 }} />
            </div>
        )
    }

    // Redirect to login after 2 seconds if not initialized
    if (redirect) {
        return <Navigate to="/login" replace />
    }

    // Show protected content if initialized
    return children
}