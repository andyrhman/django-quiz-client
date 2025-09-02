import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
    Container, Row, Col, Card, Spinner, Alert, Badge, ListGroup, Button, ProgressBar
} from 'react-bootstrap'
import api from '../api/axios'

function formatDateTime(t) {
    if (!t) return '-'
    try {
        const d = new Date(t)
        return d.toLocaleString()
    } catch {
        return String(t)
    }
}

export default function QuizReviewPage() {
    const { attemptId } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    const page = Number(searchParams.get('question_page')) || 1

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [data, setData] = useState(null) // entire response

    const fetchReview = useCallback(async (pageNum = 1) => {
        setLoading(true)
        setError(null)
        try {
            const res = await api.get(`/attempts/review/${attemptId}/`, { params: { question_page: pageNum } })
            setData(res.data)
            setLoading(false)
        } catch (err) {
            setLoading(false)
            const status = err?.response?.status
            if (status === 403) {
                // Forbidden - redirect to index
                navigate('/', { replace: true })
                return
            }
            if (status === 401) {
                // not authenticated -> go to login
                navigate('/login')
                return
            }
            setError(err.response?.data || err.message || 'Failed to load review')
        }
    }, [attemptId, navigate])

    useEffect(() => {
        fetchReview(page)
    }, [fetchReview, page])

    if (loading) {
        return (
            <div style={{ minHeight: '60vh' }} className="d-flex align-items-center justify-content-center">
                <Spinner animation="border" />
            </div>
        )
    }

    if (error) {
        return (
            <Container className="py-4">
                <Alert variant="danger">{JSON.stringify(error)}</Alert>
            </Container>
        )
    }

    if (!data) return null

    const quiz = data.quiz_info || {}
    const attempt = data.attempt || {}
    const stats = data.stats || {}
    const questions = data.questions || []
    const meta = data.questions_meta || { page: 1, last_page: 1, total: 0 }

    const pageButtons = Array.from({ length: Math.max(1, meta.last_page) }, (_, i) => i + 1)

    return (
        <Container fluid className="py-4">
            <Row className="mb-3">
                <Col md={8}>
                    <h3 style={{ color: '#000' }}>{quiz.name}</h3>
                    <div className="text-muted">{quiz.category?.name} — Created by {quiz.user?.username || ' — '}</div>
                </Col>

                <Col md={4} className="text-end">
                    <Card className="shadow-sm">
                        <Card.Body>
                            <div className="d-flex justify-content-between align-items-center">
                                <div>
                                    <div className="small text-muted">Score</div>
                                    <div style={{ fontSize: 28, fontWeight: 700 }}>{attempt.score ?? 0}</div>
                                    <div className="small text-muted">{attempt.percent_score ?? 0}%</div>
                                </div>
                                <div style={{ width: 160 }}>
                                    <ProgressBar now={Math.max(0, Math.min(100, attempt.percent_score || 0))} label={`${Math.round(attempt.percent_score || 0)}%`} />
                                    <div className="small text-muted mt-2">Duration: {attempt.duration || '-'}</div>
                                    <div className="small text-muted">Started: {formatDateTime(attempt.started_at)}</div>
                                </div>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="mb-4">
                <Col md={8}>
                    <Card className="mb-3">
                        <Card.Body>
                            <h5 className="mb-2">Result summary</h5>
                            <div className="d-flex gap-3 flex-wrap">
                                <Badge bg="secondary" className="p-2">Total: {stats.total_questions ?? 0}</Badge>
                                <Badge bg="success" className="p-2">Correct: {stats.total_correct ?? 0}</Badge>
                                <Badge bg="danger" className="p-2">Incorrect: {stats.total_incorrect ?? 0}</Badge>
                            </div>
                        </Card.Body>
                    </Card>

                    {/* Questions list */}
                    {questions.map(q => (
                        <Card key={q.id} className="mb-3">
                            <Card.Body>
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <div className="small text-muted">Question {q.question_no} • {q.points} points</div>
                                        <h5 style={{ color: '#000' }}>{q.question}</h5>
                                    </div>
                                    <div className="text-end">
                                        <div className="small text-muted">Awarded</div>
                                        <div style={{ fontWeight: 700 }}>{q.awarded_points ?? 0}</div>
                                    </div>
                                </div>

                                <ListGroup as="ul" className="mt-3">
                                    {(q.options || []).map((opt, idx) => {
                                        // determine style for option row
                                        const selected = !!opt.selected
                                        const correct = !!opt.is_correct

                                        let variantClass = 'list-group-item'
                                        if (correct) {
                                            // correct option always green
                                            variantClass = 'list-group-item bg-success text-dark'
                                        } else if (selected && !correct) {
                                            // selected wrong -> red
                                            variantClass = 'list-group-item bg-danger text-dark'
                                        } else {
                                            variantClass = 'list-group-item'
                                        }

                                        return (
                                            <ListGroup.Item key={opt.id} as="li" className={variantClass} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                    <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>
                                                        <strong>{String.fromCharCode(65 + idx)}</strong>
                                                    </div>
                                                    <div style={{ color: '#000' }}>{opt.text}</div>
                                                </div>

                                                <div className="small text-muted">
                                                    {selected ? <strong>Selected</strong> : ''}
                                                </div>
                                            </ListGroup.Item>
                                        )
                                    })}
                                </ListGroup>

                                {q.explanation && (
                                    <Card className="mt-3">
                                        <Card.Body>
                                            <strong>Explanation</strong>
                                            <div className="mt-2" style={{ color: '#222' }}>{q.explanation}</div>
                                        </Card.Body>
                                    </Card>
                                )}
                            </Card.Body>
                        </Card>
                    ))}

                    <div className="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>Back</Button>
                        </div>

                        <div className="d-flex gap-2 align-items-center">
                            {/* page buttons */}
                            {pageButtons.map(p => (
                                <Button
                                    key={p}
                                    size="lg"
                                    variant={p === page ? 'warning' : 'light'}
                                    onClick={() => setSearchParams(p > 1 ? { question_page: p } : {}, { replace: true })}
                                    style={{ minWidth: 52, padding: '8px 14px', fontSize: 16 }}
                                >
                                    {p}
                                </Button>
                            ))}
                        </div>
                    </div>
                </Col>

                <Col md={4}>
                    <Card>
                        <Card.Body>
                            <h5>Attempt Details</h5>
                            <div className="mb-2"><strong>Attempt ID:</strong> <div className="small text-muted">{attempt.attempt_id}</div></div>
                            <div className="mb-2"><strong>Score:</strong> <div className="small text-muted">{attempt.score} ({attempt.percent_score}%)</div></div>
                            <div className="mb-2"><strong>Duration:</strong> <div className="small text-muted">{attempt.duration}</div></div>
                            <div className="mb-2"><strong>Started:</strong> <div className="small text-muted">{formatDateTime(attempt.started_at)}</div></div>
                            <div className="mb-2"><strong>Finished:</strong> <div className="small text-muted">{formatDateTime(attempt.finished_at)}</div></div>

                            <hr />

                            <div className="d-grid gap-2">
                                <Button variant="outline-primary" onClick={() => window.print()}>Print</Button>
                                <Button variant="outline-secondary" onClick={() => navigate('/')}>Back to quizzes</Button>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    )
}
