import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
    Row, Col, Card, Button, Spinner, Badge, ListGroup, Form, Alert, Container, Modal
} from 'react-bootstrap'
import api from '../api/axios'

const STORAGE_KEY = (quizId) => `quiz_preview_${quizId}_state_v1`

function secToTime(sec) {
    // always return HH:MM:SS and handle null safely
    if (sec == null) return '00:00:00'
    if (sec < 0) sec = 0
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function QuizPreviewPage() {
    const { quizId } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    const page = Number(searchParams.get('question_page')) || 1

    const [loading, setLoading] = useState(true)
    const [quiz, setQuiz] = useState(null)
    const [questions, setQuestions] = useState([])
    const [meta, setMeta] = useState({ page: 1, last_page: 1, total: 0 })
    const [error, setError] = useState(null)

    const [answers, setAnswers] = useState({})           // { questionId: [optionId, ...] }
    const [revealed, setRevealed] = useState({})         // which question IDs are revealed
    const [pageQuestionMap, setPageQuestionMap] = useState({}) // page -> [questionId]

    const [secondsLeft, setSecondsLeft] = useState(null)
    const timerRef = useRef(null)

    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState(null)
    const [submitSuccessMsg, setSubmitSuccessMsg] = useState(null)

    const [confirmOpen, setConfirmOpen] = useState(false)

    // safe localStorage helpers
    const loadStored = useCallback(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY(quizId))
            console.debug('[loadStored] key=', STORAGE_KEY(quizId), 'raw=', raw)
            if (!raw) return null
            const parsed = JSON.parse(raw)
            if (typeof parsed !== 'object' || parsed === null) return null
            console.debug('[loadStored] parsed=', parsed)
            return parsed
        } catch (e) {
            console.warn('Failed to parse stored preview state', e)
            // clear the corrupted key to avoid repeated errors
            try { localStorage.removeItem(STORAGE_KEY(quizId)) } catch { }
            return null
        }
    }, [quizId])

    const saveStored = useCallback((payload) => {
        try {
            console.debug('[saveStored] key=', STORAGE_KEY(quizId), 'payload=', payload)
            localStorage.setItem(STORAGE_KEY(quizId), JSON.stringify(payload))
        } catch (e) {
            console.warn('Failed to save preview state', e)
        }
    }, [quizId])

    const clearStored = useCallback(() => {
        try { localStorage.removeItem(STORAGE_KEY(quizId)) } catch (e) { }
    }, [quizId])

    // remove all stored quiz preview attempts (keys starting with 'quiz_preview_')
    const clearAllStoredAttempts = useCallback(() => {
        try {
            const prefix = 'quiz_preview_'
            const keys = Object.keys(localStorage)
            keys.forEach(k => { if (k && k.startsWith(prefix)) localStorage.removeItem(k) })
            console.debug('[clearAllStoredAttempts] cleared all quiz_preview_ keys')
        } catch (e) {
            console.warn('Failed to clear all stored quiz attempts', e)
        }
    }, [])

    // fetch preview page function
    const fetchPage = useCallback(async (pageNum = 1) => {
        setLoading(true)
        setError(null)
        try {
            const res = await api.get(`/quizinfo/preview/${quizId}/with-questions-explanation/`, { params: { question_page: pageNum } })
            const data = res.data
            console.debug('[fetchPage] fetched data for page', pageNum, data)
            setQuiz({
                id: data.id,
                name: data.name,
                category: data.category,
                time_limit: data.time_limit
            })
            setQuestions(data.questions || [])
            setMeta(data.questions_meta || { page: 1, last_page: 1, total: 0 })

            // store page -> question ids mapping
            const qids = (data.questions || []).map(q => q.id)
            setPageQuestionMap(prev => {
                const next = { ...(prev || {}), [pageNum]: qids }
                const stored = loadStored() || {}
                stored.pageQuestionMap = { ...(stored.pageQuestionMap || {}), [pageNum]: qids }
                stored.answers = stored.answers || {}
                stored.revealed = stored.revealed || {}
                // ensure endAt is an absolute ms timestamp if not present
                stored.endAt = stored.endAt || (Date.now() + ((data.time_limit || 0) * 1000))
                saveStored(stored)
                console.debug('[fetchPage] saved pageQuestionMap, stored=', stored)
                return next
            })

            // helper to normalize stored endAt (seconds -> ms or string -> number)
            const normalizeEndAt = (val) => {
                if (val == null) return null
                const n = Number(val)
                if (Number.isNaN(n)) return null
                // if looks like seconds (e.g. <= 1e12), convert to ms
                return n < 1e12 ? n * 1000 : n
            }

            // load stored (answers, revealed, endAt) and normalize endAt
            const stored = loadStored()
            console.debug('[fetchPage] loaded stored after fetch=', stored)
            if (stored) {
                if (stored.answers && typeof stored.answers === 'object') setAnswers(stored.answers)
                if (stored.revealed && typeof stored.revealed === 'object') setRevealed(stored.revealed)

                const rawEnd = normalizeEndAt(stored.endAt)
                let endAt = rawEnd
                if (!endAt && data.time_limit) {
                    endAt = Date.now() + (data.time_limit * 1000)
                }
                if (endAt) {
                    // persist normalized endAt back to storage
                    stored.endAt = endAt
                    saveStored({ ...stored, endAt, answers: stored.answers || {}, revealed: stored.revealed || {}, pageQuestionMap: stored.pageQuestionMap || {} })
                    const remaining = Math.floor((endAt - Date.now()) / 1000)
                    console.debug('[fetchPage] endAt normalized ->', endAt, 'remaining(s)=', remaining)
                    setSecondsLeft(Math.max(0, remaining))
                } else {
                    setSecondsLeft(null)
                }
            } else {
                const endAt = Date.now() + ((data.time_limit || 0) * 1000)
                saveStored({ endAt, answers: {}, revealed: {}, pageQuestionMap: { [pageNum]: qids } })
                setSecondsLeft(Math.max(0, Math.floor((endAt - Date.now()) / 1000)))
            }

            setLoading(false)
        } catch (err) {
            setLoading(false)
            setError(err.response?.data || err.message || 'Failed to fetch quiz preview')
        }
    }, [quizId, loadStored, saveStored])

    // Build answers payload and POST to backend
    const doSubmit = useCallback(async (finish = true) => {
        if (submitting) return
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccessMsg(null)
        try {
            const stored = loadStored() || {}
            const map = (stored.pageQuestionMap && typeof stored.pageQuestionMap === 'object') ? stored.pageQuestionMap : (pageQuestionMap || {})

            // gather known question ids safely
            const knownQids = new Set()
            if (map && typeof map === 'object') {
                const vals = Object.values(map)
                if (Array.isArray(vals)) {
                    vals.forEach(list => {
                        if (Array.isArray(list)) list.forEach(id => knownQids.add(id))
                    })
                }
            }
            // also include currently loaded questions
            (questions || []).forEach(q => { if (q && q.id) knownQids.add(q.id) })

            // Build answers array
            const answersArr = []
            knownQids.forEach(qid => {
                const sel = Array.isArray(answers[qid]) ? answers[qid] : []
                answersArr.push({ question_id: qid, selected_option_ids: sel })
            })

            const payload = { quiz_info: quizId, finish: !!finish, answers: answersArr }
            console.debug('[doSubmit] payload=', payload)
            const res = await api.post('/attempts/submit/', payload)

            // stop timer & clear storage so no auto-submit after success
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
            setSecondsLeft(null)
            // clear this quiz stored key
            clearStored()
            // also remove any leftover preview attempts to avoid conflicts later
            clearAllStoredAttempts()

            // redirect to review page if attempt id present
            const attemptId = res.data?.attempt_id || res.data?.id || res.data?.attempt?.attempt_id
            console.debug('[doSubmit] response=', res.data)
            if (attemptId) {
                navigate(`/quiz/review/${attemptId}`)
                return
            }

            // fallback: show success message and keep on page
            setSubmitSuccessMsg(res.data?.message || 'Submitted')
            setSubmitting(false)
        } catch (err) {
            setSubmitError(err.response?.data || err.message || 'Failed to submit')
            setSubmitting(false)
        }
    }, [submitting, answers, questions, pageQuestionMap, quizId, clearStored, navigate, loadStored, clearAllStoredAttempts])
    useEffect(() => {
        if (secondsLeft == null) return
        // do not auto-submit on mount when timer already expired
        if (secondsLeft <= 0) {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
            return
        }

        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

        console.debug('[timer] starting interval, secondsLeft=', secondsLeft)
        timerRef.current = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev == null) return prev
                const next = prev <= 1 ? 0 : prev - 1
                console.debug('[timer] tick ->', next)
                if (prev <= 1) {
                    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                    doSubmit(true)   // safe: doSubmit is defined ABOVE now
                    return 0
                }
                return next
            })
        }, 1000)

        return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
    }, [secondsLeft, doSubmit])

    // ensure timer is stopped when component unmounts (prevents background ticking)
    useEffect(() => {
        return () => {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        }
    }, [])

    // persist answers / revealed / pageQuestionMap / endAt -> localStorage
    useEffect(() => {
        // load existing stored so we don't accidentally overwrite endAt with a "now" value
        const stored = loadStored() || {}
        // keep existing endAt if present; otherwise set it only if quiz has a time_limit
        let endAt = stored.endAt
        if (!endAt && quiz?.time_limit) {
            endAt = Date.now() + ((quiz.time_limit || 0) * 1000)
        }
        const payload = {
            endAt,
            answers,
            revealed,
            pageQuestionMap: { ...(stored.pageQuestionMap || {}), ...(pageQuestionMap || {}) }
        }
        console.debug('[persistEffect] saving payload=', payload)
        saveStored(payload)
    }, [answers, revealed, pageQuestionMap, loadStored, saveStored, quiz])

    // fetch page when page changes
    useEffect(() => {
        fetchPage(page)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, quizId])

    // user selects option(s)
    const handleSelect = useCallback((question, optionId) => {
        setAnswers(prev => {
            const copy = { ...(prev || {}) }
            const cur = Array.isArray(copy[question.id]) ? copy[question.id].slice() : []
            if (question.question_type === 'single') {
                copy[question.id] = [optionId]
            } else {
                const idx = cur.indexOf(optionId)
                if (idx === -1) cur.push(optionId)
                else cur.splice(idx, 1)
                copy[question.id] = cur
            }
            // persist immediately so navigation away won't lose the change
            try {
                const stored = loadStored() || {}
                const payload = {
                    endAt: stored.endAt,
                    answers: copy,
                    revealed,
                    pageQuestionMap: { ...(stored.pageQuestionMap || {}), ...(pageQuestionMap || {}) }
                }
                saveStored(payload)
            } catch (e) {
                console.warn('Failed to persist answers on select', e)
            }
            return copy
        })
    }, [])

    // reveal explanation on demand
    const handleReveal = useCallback((qId) => {
        setRevealed(prev => ({ ...(prev || {}), [qId]: true }))
    }, [])

    // is page answered? check stored mapping first, fallback to local pageQuestionMap
    const isPageAnswered = useCallback((p) => {
        const stored = loadStored() || {}
        const map = (stored.pageQuestionMap && typeof stored.pageQuestionMap === 'object') ? stored.pageQuestionMap : (pageQuestionMap || {})
        if (!map || typeof map !== 'object') return false
        const qids = Array.isArray(map[p]) ? map[p] : []
        for (const qid of qids) {
            if (Array.isArray(answers[qid]) && answers[qid].length > 0) return true
        }
        return false
    }, [answers, loadStored, pageQuestionMap])


    // UI class for option rows when revealed
    const optionClass = (question, opt) => {
        if (!revealed[question.id]) return 'list-group-item'
        const selected = Array.isArray(answers[question.id]) && answers[question.id].includes(opt.id)
        if (opt.is_correct) return 'list-group-item bg-success text-dark'
        if (selected && !opt.is_correct) return 'list-group-item bg-danger text-dark'
        return 'list-group-item'
    }

    if (loading) return (
        <div style={{ minHeight: '50vh' }} className="d-flex align-items-center justify-content-center">
            <Spinner animation="border" />
        </div>
    )
    if (error) return <Container className="py-4"><Alert variant="danger">{JSON.stringify(error)}</Alert></Container>

    const pageButtons = Array.from({ length: Math.max(1, meta.last_page) }, (_, i) => i + 1)

    return (
        <Container fluid className="py-4">
            <Row>
                <Col>
                    {/* changed header text color to black */}
                    <h2 style={{ color: '#000' }}>{quiz?.name}</h2>
                    <div className="text-muted mb-2" style={{ color: '#222' }}>{quiz?.category?.name}</div>
                </Col>

                <Col xs="auto" className="text-end">
                    <div className="mb-1"><strong>Time left</strong></div>
                    <div style={{ fontSize: 24 }}>
                        <Badge bg={(secondsLeft != null && secondsLeft <= 10) ? 'danger' : 'secondary'} style={{ padding: '10px 16px', fontSize: 18 }}>
                            {secToTime(secondsLeft ?? 0)}
                        </Badge>
                    </div>
                </Col>
            </Row>

            <Row className="mt-3">
                <Col md={8}>
                    {questions.map((q) => (
                        <Card key={q.id} className="mb-3">
                            <Card.Body>
                                <div className="mb-2 small text-muted">Pertanyaan ke-{q.question_no} dari {meta.total}</div>
                                <h5 className="mb-3">{q.question}</h5>

                                <ListGroup as="ul" className="mb-3">
                                    {(q.options || []).map((opt, idx) => (
                                        <ListGroup.Item
                                            key={opt.id}
                                            as="li"
                                            className={optionClass(q, opt)}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                                            onClick={() => handleSelect(q, opt.id)}
                                        >
                                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                <div style={{
                                                    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    borderRadius: 6, border: '1px solid #ddd', background: 'white'
                                                }}>
                                                    <strong>{String.fromCharCode(65 + idx)}</strong>
                                                </div>
                                                <div style={{ color: '#000' }}>{opt.text}</div>
                                            </div>

                                            <div style={{ marginLeft: 12 }}>
                                                {q.question_type === 'single'
                                                    ? <Form.Check type="radio" checked={(answers[q.id] || [])[0] === opt.id} readOnly />
                                                    : <Form.Check type="checkbox" checked={(answers[q.id] || []).includes(opt.id)} readOnly />
                                                }
                                            </div>
                                        </ListGroup.Item>
                                    ))}
                                </ListGroup>

                                <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                        <Button size="sm" variant="outline-primary" onClick={() => handleReveal(q.id)}>Show answer & explanation</Button>
                                    </div>

                                    <div>
                                        <Button variant="secondary" size="sm" className="me-2"
                                            onClick={() => setSearchParams({ question_page: Math.max(1, meta.page - 1) }, { replace: true })}
                                            disabled={meta.page <= 1}>Prev</Button>
                                        <Button variant="primary" size="sm"
                                            onClick={() => setSearchParams({ question_page: Math.min(meta.last_page, meta.page + 1) }, { replace: true })}
                                            disabled={meta.page >= meta.last_page}>Next</Button>
                                    </div>
                                </div>

                                {revealed[q.id] && q.explanation && (
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

                    <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <Button variant="outline-danger" onClick={() => setConfirmOpen(true)} disabled={submitting}>
                                {submitting ? (<><Spinner size="sm" animation="border" /> Submitting...</>) : 'Submit & Finish'}
                            </Button>
                        </div>

                        <div className="text-muted small">
                            {submitError && <span className="text-danger me-2">{JSON.stringify(submitError)}</span>}
                            {submitSuccessMsg && <span className="text-success me-2">{submitSuccessMsg}</span>}
                        </div>
                    </div>

                    {/* Confirmation modal */}
                    <Modal show={confirmOpen} onHide={() => setConfirmOpen(false)} centered>
                        <Modal.Header closeButton><Modal.Title>Submit quiz</Modal.Title></Modal.Header>
                        <Modal.Body>Are you sure you want to submit your answers? You won't be able to change them afterwards.</Modal.Body>
                        <Modal.Footer>
                            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</Button>
                            <Button variant="danger" onClick={() => { setConfirmOpen(false); doSubmit(true) }} disabled={submitting}>
                                {submitting ? (<><Spinner size="sm" animation="border" /> Submitting...</>) : 'Yes, submit'}
                            </Button>
                        </Modal.Footer>
                    </Modal>

                </Col>

                <Col md={4}>
                    <Card>
                        <Card.Body>
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <div><strong>Daftar Pertanyaan</strong></div>
                                <div style={{ fontSize: 18 }}><i className="bi-list"></i></div>
                            </div>

                            <div className="d-flex gap-2 flex-wrap mb-3">
                                {pageButtons.map(p => {
                                    const isCurrent = p === page
                                    const answered = isPageAnswered(p)
                                    let variant = 'light'
                                    if (isCurrent) variant = 'warning'
                                    else if (answered) variant = 'success'
                                    return (
                                        <Button
                                            key={p}
                                            size="lg"
                                            variant={variant}
                                            onClick={() => setSearchParams(p > 1 ? { question_page: p } : {}, { replace: true })}
                                            style={{ minWidth: 52, padding: '8px 14px', fontSize: 16 }}
                                        >
                                            {p}
                                        </Button>
                                    )
                                })}
                            </div>

                            <hr />

                            <div className="mb-2"><strong>Legend</strong></div>
                            <div className="d-flex flex-column gap-2">
                                <div><Badge bg="light" text="dark" style={{ padding: '8px 12px' }}>Unanswered</Badge></div>
                                <div><Badge bg="success" style={{ padding: '8px 12px' }}>Answered</Badge></div>
                                <div><Badge bg="warning" text="dark" style={{ padding: '8px 12px' }}>Current</Badge></div>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    )
}
