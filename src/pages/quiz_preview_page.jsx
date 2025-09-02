import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
    Row, Col, Card, Button, Spinner, Badge, ListGroup, Form, Alert, Container, Modal
} from 'react-bootstrap'
import api from '../api/axios'

const STORAGE_KEY = (quizId) => `quiz_preview_${quizId}_state_v1`

function secToTime(sec) {
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

    // quiz UI state
    const [loading, setLoading] = useState(true)
    const [quiz, setQuiz] = useState(null)
    const [questions, setQuestions] = useState([])
    const [meta, setMeta] = useState({ page: 1, last_page: 1, total: 0 })
    const [error, setError] = useState(null)

    // attempt state
    const [answers, setAnswers] = useState({})           // { questionId: [optionId, ...] }
    const [revealed, setRevealed] = useState({})         // which question IDs are revealed
    const [pageQuestionMap, setPageQuestionMap] = useState({}) // page -> [questionId]

    // timer & refs
    const [secondsLeft, setSecondsLeft] = useState(null)
    const timerRef = useRef(null)
    const resumedFlagRef = useRef(false)   // if you already added this earlier
    const submittingRef = useRef(false)    // NEW: prevents concurrent submits in runtime

    // flow controls
    const [attemptStarted, setAttemptStarted] = useState(false) // when true we persist storage on actions
    const [resumePromptOpen, setResumePromptOpen] = useState(false)
    const [resumePromptHandled, setResumePromptHandled] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    // submit
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState(null)
    const [submitSuccessMsg, setSubmitSuccessMsg] = useState(null)

    // ---------- localStorage helpers ----------
    const loadStored = useCallback(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY(quizId))
            if (!raw) return null
            const parsed = JSON.parse(raw)
            if (typeof parsed !== 'object' || parsed === null) return null
            return parsed
        } catch (e) {
            // corrupted => remove and return null
            try { localStorage.removeItem(STORAGE_KEY(quizId)) } catch { }
            return null
        }
    }, [quizId])

    const saveStored = useCallback((payload) => {
        try {
            localStorage.setItem(STORAGE_KEY(quizId), JSON.stringify(payload))
        } catch (e) {
            console.warn('Failed to save preview state', e)
        }
    }, [quizId])

    const clearStored = useCallback(() => {
        try { localStorage.removeItem(STORAGE_KEY(quizId)) } catch (e) { }
    }, [quizId])

    // helper to clear all preview keys (used on submit)
    const clearAllStoredAttempts = useCallback(() => {
        try {
            const prefix = 'quiz_preview_'
            const keys = Object.keys(localStorage)
            keys.forEach(k => { if (k && k.startsWith(prefix)) localStorage.removeItem(k) })
        } catch (e) { /* ignore */ }
    }, [])

    // replace your existing fetchPage with this
    const fetchPage = useCallback(async (pageNum = 1, { resume = false } = {}) => {
        setLoading(true)
        setError(null)

        try {
            const res = await api.get(`/quizinfo/preview/${quizId}/with-questions-explanation/`, { params: { question_page: pageNum } })
            const data = res.data

            setQuiz({
                id: data.id,
                name: data.name,
                category: data.category,
                time_limit: data.time_limit
            })
            setQuestions(data.questions || [])
            setMeta(data.questions_meta || { page: 1, last_page: 1, total: 0 })

            // build page -> qids (in-memory)
            const qids = (data.questions || []).map(q => q.id)
            setPageQuestionMap(prev => ({ ...(prev || {}), [pageNum]: qids }))

            // If we're resuming, then we *may* want to persist/normalize stored values.
            // If not resuming (first visit), do NOT create storage keys.
            const stored = loadStored()
            if (stored) {
                // restore answers/revealed
                if (stored.answers && typeof stored.answers === 'object') setAnswers(stored.answers)
                if (stored.revealed && typeof stored.revealed === 'object') setRevealed(stored.revealed)

                // normalize endAt and set secondsLeft
                const raw = stored.endAt
                let endAt = null
                if (raw != null) {
                    const n = Number(raw)
                    if (!Number.isNaN(n)) endAt = (n < 1e12 ? n * 1000 : n)
                }
                if (!endAt && data.time_limit) endAt = Date.now() + (data.time_limit * 1000)
                if (endAt) {
                    const remaining = Math.floor((endAt - Date.now()) / 1000)
                    setSecondsLeft(Math.max(0, remaining))
                    // if resume flag is true, persist normalized endAt and pageQuestionMap (safe overwrite)
                    if (resume) {
                        saveStored({ ...stored, endAt, answers: stored.answers || {}, revealed: stored.revealed || {}, pageQuestionMap: { ...(stored.pageQuestionMap || {}), [pageNum]: qids } })
                    }
                } else {
                    setSecondsLeft(data.time_limit ?? 0)
                }
            } else {
                // no stored: set timer from server but DO NOT create storage here
                setSecondsLeft(data.time_limit ?? 0)
                // only persist pageQuestionMap if explicitly asked to resume (shouldn't happen)
                if (resume) {
                    saveStored({ endAt: Date.now() + ((data.time_limit || 0) * 1000), answers: {}, revealed: {}, pageQuestionMap: { [pageNum]: qids } })
                }
            }

            setLoading(false)
            // resolve so callers can await
            return
        } catch (err) {
            setLoading(false)
            setError(err.response?.data || err.message || 'Failed to fetch quiz preview')
            throw err
        }
    }, [quizId, loadStored, saveStored])


    // ---------- doSubmit (defined before timer effect) ----------
    const doSubmit = useCallback(async (finish = true) => {
        // prevent concurrent submits in the component runtime
        if (submittingRef.current) return
        submittingRef.current = true
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccessMsg(null)

        try {
            // Load current stored state (if any)
            let stored = loadStored() || {}

            // If we've already flagged this stored attempt as submitted or pending submission,
            // avoid duplicate submit. If pending but older than some threshold, allow retry.
            if (stored.submitted) {
                console.debug('[doSubmit] attempt already submitted according to storage, aborting')
                return
            }

            if (stored.pending_submit) {
                // If someone already set pending_submit, don't duplicate. However if you'd like
                // to retry in some window, implement a timestamp check here.
                console.debug('[doSubmit] pending_submit already set in storage, aborting duplicate submit')
                return
            }

            // mark pending in storage so other tabs/effects won't try to submit too
            try {
                stored.pending_submit = true
                saveStored(stored)
            } catch (e) {
                console.warn('[doSubmit] failed to mark pending_submit in storage (continuing)', e)
            }

            // Build answers payload. Prefer stored.answers (source-of-truth),
            // but also merge in-memory answers that may not yet be in storage.
            const submittedAnswersMap = {} // questionId -> [optionIds]
            if (stored.answers && typeof stored.answers === 'object') {
                Object.entries(stored.answers).forEach(([qid, arr]) => {
                    if (Array.isArray(arr) && arr.length > 0) submittedAnswersMap[qid] = Array.from(arr)
                })
            }

            // Merge in-memory answers (state) if they have anything not present in stored
            if (answers && typeof answers === 'object') {
                Object.entries(answers).forEach(([qid, arr]) => {
                    if (Array.isArray(arr) && arr.length > 0) {
                        // prefer stored value if present, otherwise use in-memory
                        if (!submittedAnswersMap[qid]) submittedAnswersMap[qid] = Array.from(arr)
                    }
                })
            }

            // Build array payload
            const answersArr = Object.entries(submittedAnswersMap).map(([qid, arr]) => ({
                question_id: qid,
                selected_option_ids: Array.isArray(arr) ? arr : []
            }))

            // Debug: log payload so you can inspect in console/network
            console.debug('[doSubmit] final answers payload', { quiz_info: quizId, finish, answersArr })

            const payload = { quiz_info: quizId, finish: !!finish, answers: answersArr }
            const res = await api.post('/attempts/submit/', payload)

            // On success: clear timer and storage and redirect to review if present
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
            setSecondsLeft(null)

            // clear storage for this quiz (successful submit)
            try {
                clearStored()
            } catch (e) { /* ignore */ }

            // also remove leftover preview keys (optional safety)
            try { clearAllStoredAttempts() } catch (e) { /* ignore */ }

            const attemptId = res.data?.attempt_id || res.data?.id || res.data?.attempt?.attempt_id
            console.debug('[doSubmit] response', res.data)
            if (attemptId) {
                // avoid further submits in this runtime
                submittingRef.current = false
                setSubmitting(false)
                navigate(`/quiz/review/${attemptId}`)
                return
            }

            // fallback: show success message
            setSubmitSuccessMsg(res.data?.message || 'Submitted')
            setSubmitting(false)
            submittingRef.current = false
        } catch (err) {
            // If request failed, clear pending_submit to allow retry and show error
            try {
                const stored2 = loadStored() || {}
                if (stored2.pending_submit) {
                    delete stored2.pending_submit
                    saveStored(stored2)
                }
            } catch (e) {
                console.warn('[doSubmit] failed to clear pending_submit after error', e)
            }

            setSubmitError(err.response?.data || err.message || 'Failed to submit')
            setSubmitting(false)
            submittingRef.current = false
        }
    }, [answers, questions, pageQuestionMap, quizId, clearStored, navigate, loadStored, saveStored, clearAllStoredAttempts])

    // ---------- timer: only start when secondsLeft > 0 (auto-submit only when reaches 0 from positive) ----------
    useEffect(() => {
        if (secondsLeft == null) return
        if (secondsLeft <= 0) {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
            return
        }
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        timerRef.current = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev == null) return prev
                if (prev <= 1) {
                    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                    doSubmit(true)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
    }, [secondsLeft, doSubmit])

    useEffect(() => () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }, [])

    // ---------- persist only when attemptStarted === true ----------
    useEffect(() => {
        if (!attemptStarted) return
        // load previous endAt if exists else set new endAt
        const stored = loadStored() || {}
        let endAt = stored.endAt
        if (!endAt && quiz?.time_limit) endAt = Date.now() + ((quiz.time_limit || 0) * 1000)
        const payload = {
            endAt,
            answers,
            revealed,
            pageQuestionMap: { ...(stored.pageQuestionMap || {}), ...(pageQuestionMap || {}) }
        }
        saveStored(payload)
    }, [answers, revealed, pageQuestionMap, loadStored, saveStored, quiz, attemptStarted])

    // ---------- resume prompt detection on mount ----------
    useEffect(() => {
        // avoid re-checking if user already handled resume this session
        if (resumedFlagRef.current) return

        const stored = loadStored()

        // no stored attempt -> proceed (no modal)
        if (!stored) {
            setResumePromptOpen(false)
            setResumePromptHandled(true)
            return
        }

        // if stored explicitly marked as submitted/cleared -> remove and proceed
        if (stored.submitted) {
            try { clearStored() } catch (_) { }
            setResumePromptOpen(false)
            setResumePromptHandled(true)
            resumedFlagRef.current = true
            return
        }

        // normalize endAt to ms (support legacy seconds)
        let endAt = null
        if (stored.endAt != null) {
            const n = Number(stored.endAt)
            if (!Number.isNaN(n)) endAt = n < 1e12 ? n * 1000 : n
        }

        // if endAt exists and already in the past -> auto-submit now
        if (endAt && Date.now() >= endAt) {
            console.debug('[resume] stored attempt expired -> auto-submitting', { quizId, endAt })
            // mark handled so we don't show resume modal or fetch page normally
            setResumePromptOpen(false)
            setResumePromptHandled(true)
            resumedFlagRef.current = true

            // async submit; doSubmit will clear storage on success
            doSubmit(true).catch(err => {
                console.warn('[resume] auto-submit failed', err)
                setError(err.response?.data || err.message || 'Auto-submit failed; please try submitting manually.')
            })
            return
        }

        // if there are answers or an endAt (meaning meaningful stored attempt), show resume modal
        const hasAnswers = stored.answers && Object.keys(stored.answers || {}).length > 0
        const hasEndAt = endAt != null
        if (hasAnswers || hasEndAt) {
            setResumePromptOpen(true)
            setResumePromptHandled(false)
            setLoading(false) // white page behind modal
            // do NOT set resumedFlagRef here yet — only after user chooses Resume/Restart/Exit
            return
        }

        // otherwise proceed normally
        setResumePromptOpen(false)
        setResumePromptHandled(true)
        resumedFlagRef.current = true
    }, [quizId]) // only re-run when quizId changes

    // fetch page after prompt handled or immediately if none
    useEffect(() => {
        if (!resumePromptHandled) return
        fetchPage(page)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumePromptHandled, page, quizId])

    const handleResume = useCallback(async () => {
        // close prompt and fetch the stored page first (restoration only)
        setResumePromptOpen(false)

        const stored = loadStored()
        const target = stored?.currentPage || page

        try {
            await fetchPage(target, { resume: true })
            // only AFTER fetchPage completed and answers restored, mark attempt started
            setAttemptStarted(true)
            resumedFlagRef.current = true          // <--- mark handled
            if (Number(target) !== Number(page)) {
                setSearchParams(target > 1 ? { question_page: target } : {}, { replace: true })
            }
        } catch (e) {
            console.warn('Failed to restore stored attempt, starting fresh', e)
            setAttemptStarted(false)
            setResumePromptHandled(true)
            resumedFlagRef.current = true
            fetchPage(page, { resume: false }).catch(() => { })
        }
        setResumePromptHandled(true)
    }, [loadStored, page, fetchPage, setSearchParams])

    const handleRestart = useCallback(() => {
        clearStored()
        setAttemptStarted(false)
        setResumePromptOpen(false)
        setResumePromptHandled(true)
        resumedFlagRef.current = true   // <--- mark handled
        fetchPage(page)
    }, [clearStored, page, fetchPage])

    const handleExit = useCallback(() => {
        resumedFlagRef.current = true   // <--- mark handled
        navigate('/')
    }, [navigate])

    // ---------- option select: create storage on first interaction if needed ----------
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

            // if attempt hasn't started (first interaction on a brand new attempt),
            // initialize storage so we persist subsequent changes.
            if (!attemptStarted) {
                // create storage record using server time_limit if available (endAt ms)
                const endAt = quiz?.time_limit ? Date.now() + (quiz.time_limit * 1000) : null
                const initialPayload = { endAt, answers: copy, revealed, pageQuestionMap: { ...(pageQuestionMap || {}), [page]: (pageQuestionMap[page] || []).slice() }, currentPage: page }
                saveStored(initialPayload)
                setAttemptStarted(true)
            } else {
                // already started/resumed -> persist immediate change
                try {
                    const stored = loadStored() || {}
                    const payload = {
                        endAt: stored.endAt,
                        answers: copy,
                        revealed,
                        pageQuestionMap: { ...(stored.pageQuestionMap || {}), ...(pageQuestionMap || {}) },
                        currentPage: page
                    }
                    saveStored(payload)
                } catch (e) {
                    console.warn('Failed to persist answers on select', e)
                }
            }

            return copy
        })
    }, [attemptStarted, quiz, revealed, pageQuestionMap, page, saveStored, loadStored])

    // reveal explanation (persist when attemptStarted)
    const handleReveal = useCallback((qId) => {
        setRevealed(prev => {
            const next = { ...(prev || {}), [qId]: true }
            if (attemptStarted) {
                try {
                    const stored = loadStored() || {}
                    saveStored({ ...(stored || {}), revealed: next })
                } catch (e) { /* ignore */ }
            }
            return next
        })
    }, [attemptStarted, loadStored, saveStored])

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

    // ---------- render ----------
    // Show resume modal first (white page behind) if existing attempt found
    if (resumePromptOpen) {
        const stored = loadStored()
        const remaining = stored?.endAt ? Math.max(0, Math.floor((Number(stored.endAt) - Date.now()) / 1000)) : null
        const answeredCount = Object.keys(stored?.answers || {}).filter(k => Array.isArray(stored.answers[k]) && stored.answers[k].length > 0).length || 0

        return (
            <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                <Modal show centered onHide={() => { /* force a choice - user can Exit */ }}>
                    <Modal.Header>
                        <Modal.Title>Unfinished attempt detected</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <p>There is an unfinished attempt for this quiz. Do you want to resume it or start a new attempt?</p>
                        {remaining != null && <div><strong>Time left:</strong> {secToTime(remaining)}</div>}
                        <div><strong>Answered questions:</strong> {answeredCount}</div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={handleExit}>Exit</Button>
                        <Button variant="outline-danger" onClick={handleRestart}>Start new attempt</Button>
                        <Button variant="primary" onClick={handleResume}>Resume attempt</Button>
                    </Modal.Footer>
                </Modal>
            </div>
        )
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
                    <h2 style={{ color: '#000' }}>{quiz?.name}</h2>
                    <div className="text-muted mb-2" style={{ color: '#222' }}>{quiz?.category?.name}</div>
                </Col>

                <Col xs="auto" className="text-end">
                    <div className="mb-1"><strong>Time left</strong></div>
                    <div style={{ fontSize: 24 }}>
                        <Badge bg={secondsLeft <= 10 ? 'danger' : 'secondary'} style={{ padding: '10px 16px', fontSize: 18 }}>
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
                                    {(q.options || []).map((opt, idx) => {
                                        const revealedRow = !!revealed[q.id]
                                        const selected = Array.isArray(answers[q.id]) && answers[q.id].includes(opt.id)
                                        const cls = !revealedRow ? 'list-group-item' : (opt.is_correct ? 'list-group-item bg-success text-dark' : (selected ? 'list-group-item bg-danger text-dark' : 'list-group-item'))
                                        return (
                                            <ListGroup.Item
                                                key={opt.id}
                                                as="li"
                                                className={cls}
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                                                onClick={() => handleSelect(q, opt.id)}
                                            >
                                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                                    <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid #ddd', background: 'white' }}>
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
                                        )
                                    })}
                                </ListGroup>

                                <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                        <Button size="sm" variant="outline-primary" onClick={() => handleReveal(q.id)}>Show answer & explanation</Button>
                                    </div>

                                    <div>
                                        <Button variant="secondary" size="sm" className="me-2" onClick={() => setSearchParams({ question_page: Math.max(1, meta.page - 1) }, { replace: true })} disabled={meta.page <= 1}>Prev</Button>
                                        <Button variant="primary" size="sm" onClick={() => setSearchParams({ question_page: Math.min(meta.last_page, meta.page + 1) }, { replace: true })} disabled={meta.page >= meta.last_page}>Next</Button>
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
