import { Navbar, Nav, Container, Button } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../services/authSlice'

export default function MainNavbar() {
    const { user } = useSelector(s => s.auth)
    const dispatch = useDispatch()
    const navigate = useNavigate()

    const handleLogout = async () => {
        await dispatch(logout())
        navigate('/login')
    }

    return (
        // full width navbar
        <Navbar bg="light" expand="md" className="border-bottom">
            {/* Use a nested Container to align content within the full-width bar */}
            <Container fluid="md">
                <Navbar.Brand as={Link} to="/">MyApp</Navbar.Brand>
                <Navbar.Toggle aria-controls="main-navbar" />
                <Navbar.Collapse id="main-navbar">
                    <Nav className="me-auto">
                        <Nav.Link as={Link} to="/welcome">Welcome</Nav.Link>
                        <Nav.Link as={Link} to="/register">Register</Nav.Link>
                    </Nav>

                    <Nav className="align-items-center">
                        {user ? (
                            <>
                                <span className="me-3 small text-muted">Signed in as <strong>{user.username || user.email}</strong></span>
                                <Button variant="outline-secondary" size="sm" onClick={handleLogout}>Logout</Button>
                            </>
                        ) : (
                            <Nav.Link as={Link} to="/login">Login</Nav.Link>
                        )}
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    )
}
