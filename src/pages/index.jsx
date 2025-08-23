import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Row, Col } from 'react-bootstrap'
import { logout } from '../services/authSlice'

export default function WelcomePage() {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { user } = useSelector(s => s.auth)

    const onLogout = async () => {
        await dispatch(logout())
        navigate('/login')
    }

    return (
        <Row className="justify-content-center">
            <Col md={8} lg={6}>
                <Card>
                    <Card.Body>
                        <Card.Title>Welcome</Card.Title>
                        <Card.Text>
                            <strong>Name:</strong> {user?.username || user?.email} <br />
                            <strong>Email:</strong> {user?.email} <br />
                            <strong>ID:</strong> {user?.id}
                        </Card.Text>

                        <div className="mt-3 d-flex justify-content-end">
                            <Button variant="primary" onClick={() => navigate('/')} className="me-2">Home</Button>
                            <Button variant="outline-danger" onClick={onLogout}>Logout</Button>
                        </div>
                    </Card.Body>
                </Card>
            </Col>
        </Row>
    )
}
