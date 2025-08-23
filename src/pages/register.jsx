import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, Link } from 'react-router-dom'
import { register, clearRegisterError } from '../services/authSlice'
import { Form, Button, Card, Row, Col, Alert } from 'react-bootstrap'
import formatError from '../utils/formatError'

export default function RegisterPage() {
    const dispatch = useDispatch()
    const navigate = useNavigate()
    const { registerLoading, registerError, registerMessage } = useSelector(s => s.auth)

    const [form, setForm] = useState({
        fullName: '',
        email: '',
        username: '',
        password: '',
        confirm_password: ''
    })
    const [clientError, setClientError] = useState(null)

    useEffect(() => {
        // clear any stale register errors when this component mounts/unmounts
        dispatch(clearRegisterError())
        return () => { dispatch(clearRegisterError()) }
    }, [dispatch])

    const onChange = e => {
        setClientError(null)
        setForm({ ...form, [e.target.name]: e.target.value })
    }

    const validate = () => {
        if (!form.fullName.trim()) return 'Full name is required'
        if (!form.email.trim()) return 'Email is required'
        if (!form.username.trim()) return 'Username is required'
        if (!form.password) return 'Password is required'
        if (form.password.length < 6) return 'Password must be at least 6 characters'
        if (form.password !== form.confirm_password) return 'Passwords do not match'
        return null
    }

    const onSubmit = async e => {
        e.preventDefault()
        const v = validate()
        if (v) { setClientError(v); return }

        const payload = {
            fullName: form.fullName,
            email: form.email,
            username: form.username,
            password: form.password,
            confirm_password: form.confirm_password
        }

        const res = await dispatch(register(payload))
        if (res.meta && res.meta.requestStatus === 'fulfilled') {
            navigate('/login')
        } else {
            setClientError('Registration failed. Please check your details and try again.')
        }
    }

    return (
        <Row className="justify-content-center">
            <Col md={10} lg={7}>
                <Card>
                    <Card.Body>
                        <Card.Title className="mb-3">Register</Card.Title>

                        {clientError && <Alert variant="danger">{clientError}</Alert>}
                        {registerError && <Alert variant="danger">{formatError(registerError)}</Alert>}
                        {registerMessage && <Alert variant="success">{formatError(registerMessage)}</Alert>}

                        <Form onSubmit={onSubmit}>
                            <Form.Group className="mb-3" controlId="fullName">
                                <Form.Label>Full name</Form.Label>
                                <Form.Control name="fullName" value={form.fullName} onChange={onChange} placeholder="Full name" />
                            </Form.Group>

                            <Form.Group className="mb-3" controlId="email">
                                <Form.Label>Email</Form.Label>
                                <Form.Control name="email" value={form.email} onChange={onChange} placeholder="email" type="email" />
                            </Form.Group>

                            <Form.Group className="mb-3" controlId="username">
                                <Form.Label>Username</Form.Label>
                                <Form.Control name="username" value={form.username} onChange={onChange} placeholder="username" />
                            </Form.Group>

                            <Form.Group className="mb-3" controlId="password">
                                <Form.Label>Password</Form.Label>
                                <Form.Control name="password" type="password" value={form.password} onChange={onChange} placeholder="password" />
                            </Form.Group>

                            <Form.Group className="mb-3" controlId="confirm_password">
                                <Form.Label>Confirm Password</Form.Label>
                                <Form.Control name="confirm_password" type="password" value={form.confirm_password} onChange={onChange} placeholder="confirm password" />
                            </Form.Group>

                            <div className="d-flex justify-content-between align-items-center">
                                <Button type="submit" disabled={registerLoading}>{registerLoading ? 'Creating...' : 'Register'}</Button>
                                <Link to="/login">Login</Link>
                            </div>
                        </Form>
                    </Card.Body>
                </Card>
            </Col>
        </Row>
    )
}