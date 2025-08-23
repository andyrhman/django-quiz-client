export default function formatError(err) {
    if (!err) return null

    // If it's already a string, return it
    if (typeof err === 'string') return err

    // If it's an object with a `message` key
    if (err.message && typeof err.message === 'string') return err.message

    // If it's an object mapping field -> [errors]
    if (typeof err === 'object') {
        const parts = []
        for (const k of Object.keys(err)) {
            const v = err[k]
            if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`)
            else if (typeof v === 'string') parts.push(`${k}: ${v}`)
            else parts.push(`${k}: ${JSON.stringify(v)}`)
        }
        return parts.join(' — ')
    }

    // Fallback
    try {
        return String(err)
    } catch (e) {
        return 'An error occurred'
    }
}
