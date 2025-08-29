import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, Link } from 'react-router-dom'
import { login, clearLoginError } from '../services/authSlice'
import { Form, Button, Card, Row, Col, Alert } from 'react-bootstrap'
import formatError from '../utils/formatError'

export default function LoginPage() {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { loginLoading, loginError } = useSelector(s => s.auth)
    const [form, setForm] = useState({ email: '', password: '' })

    useEffect(() => {
        // clear stale login errors when arriving on login page
        dispatch(clearLoginError())
        return () => { dispatch(clearLoginError()) }
    }, [dispatch])

    const onChange = e => setForm({ ...form, [e.target.name]: e.target.value })

    const onSubmit = async e => {
        e.preventDefault()
        const res = await dispatch(login(form))
        if (res.meta?.requestStatus === 'fulfilled') {
            navigate('/')
        }
    }

    return (
        <Row className="justify-content-center">
            <Col md={10} lg={7}>
                <Card>
                    <Card.Body>
                        <Card.Title className="mb-3">Login</Card.Title>

                        {loginError && <Alert variant="danger">{formatError(loginError)}</Alert>}

                        <Form onSubmit={onSubmit}>
                            <Form.Group className="mb-3" controlId="email">
                                <Form.Label>Email or Username</Form.Label>
                                <Form.Control name="email" value={form.email} onChange={onChange} placeholder="email or username" />
                            </Form.Group>

                            <Form.Group className="mb-3" controlId="password">
                                <Form.Label>Password</Form.Label>
                                <Form.Control name="password" type="password" value={form.password} onChange={onChange} placeholder="password" />
                            </Form.Group>

                            <div className="d-flex justify-content-between align-items-center">
                                <Button type="submit" disabled={loginLoading}>{loginLoading ? 'Logging...' : 'Login'}</Button>
                                <Link to="/register">Register</Link>
                            </div>
                        </Form>
                    </Card.Body>
                </Card>
            </Col>
        </Row>
    )
}