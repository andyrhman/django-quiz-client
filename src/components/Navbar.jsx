import { Link, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { Navbar, Nav, Button, Container, NavDropdown } from 'react-bootstrap'
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
        <Navbar bg="light" expand="md" className="border-bottom">
            {/* full-width bar; the Container keeps content aligned */}
            <Container fluid="md">
                <Navbar.Brand as={Link} to="/">ExamLab</Navbar.Brand>
                <Navbar.Toggle aria-controls="main-navbar" />
                <Navbar.Collapse id="main-navbar">

                    {/* Left side nav (site links + create quiz button if logged) */}
                    <Nav className="me-auto align-items-center">
                        <Nav.Link as={Link} to="/">Home</Nav.Link>
                        <Nav.Link as={Link} to="/explore">Explore</Nav.Link>
                    </Nav>

                    {/* Right side auth / user dropdown */}
                    <Nav className="align-items-center">
                        {user ? (
                            <><Button
                                as={Link}
                                to="/create"
                                size="sm"
                                variant="primary"
                                className="ms-2"
                            >
                                Create Quiz
                            </Button><NavDropdown
                                title={user.username || user.email}
                                id="user-dropdown"
                                align="end"
                            >
                                    <NavDropdown.Item as={Link} to="/my-quizzes">My Quizzes</NavDropdown.Item>
                                    <NavDropdown.Item as={Link} to="/attempts">Attempt History</NavDropdown.Item>
                                    <NavDropdown.Divider />
                                    <NavDropdown.Item onClick={handleLogout}>Logout</NavDropdown.Item>
                                </NavDropdown></>
                        ) : (
                            <>
                                <Nav.Link as={Link} to="/login">Login</Nav.Link>
                                <Nav.Link as={Link} to="/register">Register</Nav.Link>
                            </>
                        )}
                    </Nav>

                </Navbar.Collapse>
            </Container>
        </Navbar>
    )
}
