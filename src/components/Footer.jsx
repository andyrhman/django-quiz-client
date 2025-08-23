export default function Footer() {
    return (
        <footer className="mt-auto py-4 bg-light" style={{ borderTop: '1px solid #e9ecef' }}>
            <div className="container">
                <div className="text-center small text-muted">
                    © {new Date().getFullYear()} MyApp — built with ❤️
                </div>
            </div>
        </footer>
    )
}