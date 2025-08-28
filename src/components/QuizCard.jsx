import { Card, Row, Col, Button, Badge } from 'react-bootstrap'
import { Link } from 'react-router-dom'

function formatTime(seconds) {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const hrs = Math.floor(mins / 60)
    if (hrs > 0) return `${hrs}h ${mins % 60}m`
    return `${mins}m`
}

export default function QuizCard({ quiz }) {
    return (
        <Card className="shadow-sm">
            <Card.Body>
                <Row>
                    <Col md={8}>
                        <h5 className="mb-1">{quiz.name}</h5>
                        <div className="mb-2 text-muted small">
                            <span className="me-3">
                                <strong>Category:</strong> {quiz.category?.name || '-'}
                            </span>
                            <span className="me-3">
                                <strong>Author:</strong> {quiz.user?.username || 'unknown'}
                            </span>
                            <span>
                                <strong>Max score:</strong> {quiz.max_score ?? '-'}
                            </span>
                        </div>
                        <div className="text-muted small">
                            <span><strong>Created:</strong> {new Date(quiz.created_at).toLocaleString()}</span>
                        </div>
                    </Col>

                    <Col md={4} className="d-flex flex-column justify-content-between align-items-end">
                        <div className="text-end">
                            <Badge bg="info" text="dark" className="mb-2">{formatTime(quiz.time_limit)}</Badge>
                        </div>

                        <div className="d-flex gap-2">
                            <Button as={Link} to={`/quiz/${quiz.id}`} variant="primary" size="sm">Attempt</Button>
                        </div>
                    </Col>
                </Row>
            </Card.Body>
        </Card>
    )
}
