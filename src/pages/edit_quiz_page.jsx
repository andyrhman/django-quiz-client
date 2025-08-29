import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
    Row, Col, Card, Form, Button, Spinner, Pagination, Modal, InputGroup, Alert, Badge
} from 'react-bootstrap'
import api from '../api/axios'

// small error formatter
function formatError(err) {
    if (!err) return null
    if (typeof err === 'string') return err
    if (err.message && typeof err.message === 'string') return err.message
    if (typeof err === 'object') {
        const parts = []
        for (const k of Object.keys(err)) {
            const v = err[k]
            if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`)
            else parts.push(`${k}: ${JSON.stringify(v)}`)
        }
        return parts.join(' — ')
    }
    try { return String(err) } catch { return 'Error' }
}

const MAX_SINGLE = 4
const MAX_MULTI = 5

// helper to generate stable local ids for options that don't have DB ids
const genLocalId = () => Math.random().toString(36).slice(2, 9)

export default function EditQuizPage() {
    const { quizId } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()

    // stepper
    const [step, setStep] = useState(1)

    // step 1: quiz info
    const [quizInfo, setQuizInfo] = useState(null)
    const [categories, setCategories] = useState([])
    const [loadingInfo, setLoadingInfo] = useState(true)
    const [infoError, setInfoError] = useState(null)
    const [savingInfo, setSavingInfo] = useState(false)
    const [saveInfoMsg, setSaveInfoMsg] = useState(null)

    // step 2: questions pagination
    const [questions, setQuestions] = useState([])
    const [questionsLoading, setQuestionsLoading] = useState(true)
    const [questionsError, setQuestionsError] = useState(null)
    const [questionsMeta, setQuestionsMeta] = useState({ page: 1, last_page: 1, total: 0 })

    // edit modal state
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingQuestion, setEditingQuestion] = useState(null) // full question object with options

    // delete option flow
    const [optionDeleting, setOptionDeleting] = useState(false)
    const [optionDeleteError, setOptionDeleteError] = useState(null)

    // fetch categories
    const loadCategories = useCallback(async (signal) => {
        const res = await api.get('/categories/', { signal })
        return res.data || []
    }, [])

    // fetch quiz info (GET /quizinfo/:id)
    const loadQuizInfo = useCallback(async () => {
        setLoadingInfo(true)
        setInfoError(null)
        try {
            const res = await api.get(`/quizinfo/${quizId}`)
            setQuizInfo(res.data)
        } catch (err) {
            setInfoError(formatError(err.response?.data || err.message))
        } finally {
            setLoadingInfo(false)
        }
    }, [quizId])

    // fetch questions page (GET /quizinfo/:id/with-questions/?question_page=)
    const loadQuestionPage = useCallback(async (pageNum = 1, signal) => {
        const params = {}
        if (pageNum > 1) params.question_page = pageNum
        const res = await api.get(`/quizinfo/${quizId}/with-questions/`, { params, signal })
        return res.data
    }, [quizId])

    // initial load: categories + quiz info
    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

        async function init() {
            try {
                const [cats] = await Promise.all([loadCategories(controller.signal)])
                if (!cancelled) setCategories(cats)
            } catch (err) {
                if (!cancelled) console.warn('Failed loading categories', err)
            }
        }
        init()
        return () => { cancelled = true; controller.abort() }
    }, [loadCategories])

    useEffect(() => {
        loadQuizInfo()
    }, [loadQuizInfo])

    // sync question_page from URL
    const urlPage = Number(searchParams.get('question_page')) || 1
    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

        async function fetchQuestions() {
            setQuestionsLoading(true)
            setQuestionsError(null)
            try {
                const payload = await loadQuestionPage(urlPage, controller.signal)
                if (cancelled) return
                setQuestions(payload.questions || [])
                setQuestionsMeta(payload.questions_meta || { page: 1, last_page: 1, total: 0 })
            } catch (err) {
                if (!cancelled) setQuestionsError(formatError(err.response?.data || err.message))
            } finally {
                if (!cancelled) setQuestionsLoading(false)
            }
        }

        fetchQuestions()
        return () => { cancelled = true; controller.abort() }
    }, [loadQuestionPage, urlPage])

    // --- Step 1: Update quiz info via PUT /quizinfo/:id/ ---
    const onChangeInfo = (e) => {
        const { name, value } = e.target
        setQuizInfo(prev => ({ ...prev, [name]: name === 'time_limit' ? Number(value) : value }))
        setSaveInfoMsg(null)
    }

    const saveQuizInfo = async () => {
        setSavingInfo(true)
        setInfoError(null)
        setSaveInfoMsg(null)
        try {
            const payload = {
                name: quizInfo.name,
                time_limit: quizInfo.time_limit,
                ...(quizInfo.category?.id ? { category: quizInfo.category.id } : {})
            }
            await api.put(`/quizinfo/${quizId}/`, payload)
            setSaveInfoMsg('Saved')
            await loadQuizInfo()
        } catch (err) {
            setInfoError(formatError(err.response?.data || err.message))
        } finally {
            setSavingInfo(false)
        }
    }

    // --- Step 2: Editing a question ---
    // Open edit modal and attach stable __localId to every option
    const openEditQuestion = (q) => {
        const clone = {
            ...q,
            options: (q.options || []).map(o => ({
                id: o.id, // persisted id (may be undefined)
                text: o.text,
                is_correct: !!o.is_correct,
                __localId: o.id || genLocalId()
            }))
        }
        setEditingQuestion(clone)
        setShowEditModal(true)
        setOptionDeleteError(null)
    }

    // helper: sync DOM values into editingQuestion before validation/save
    const syncEditingQuestionFromDOM = () => {
        if (!editingQuestion) return
        // question textarea
        const questionEl = document.querySelector('#edit-question-textarea')
        const questionText = questionEl ? questionEl.value : editingQuestion.question

        // options inputs (each has data-localid attribute)
        const optionNodes = document.querySelectorAll('[data-localid][data-role="option-text"]')
        const newOptions = Array.from(optionNodes).map(node => {
            const localId = node.getAttribute('data-localid')
            const opt = editingQuestion.options.find(o => String(o.__localId) === String(localId))
            return { ...(opt || {}), text: node.value }
        })

        setEditingQuestion(prev => ({ ...prev, question: questionText, options: newOptions }))
    }

    // validate editingQuestion before submitting
    const validateEditingQuestion = (q) => {
        if (!q) return 'No question to validate'
        if (!q.question || !q.question.trim()) return 'Question text required'
        if (!Number.isInteger(q.question_no) || q.question_no <= 0) return 'Question number must be positive integer'
        if (!Number.isInteger(q.points) || q.points <= 0) return 'Points must be positive integer'
        const needed = q.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
        if ((q.options || []).length !== needed) return `This question type requires exactly ${needed} options`
        if (q.question_type === 'single') {
            const correct = q.options.filter(o => o.is_correct).length
            if (correct !== 1) return 'Single choice must have exactly 1 correct option'
        } else {
            const correct = q.options.filter(o => o.is_correct).length
            if (correct < 1) return 'Multiple choice must have at least 1 correct option'
        }
        for (const o of q.options) {
            if (!o.text || !o.text.trim()) return 'All options must have text'
        }
        return null
    }

    const saveEditingQuestion = async () => {
        // sync DOM values first (captures latest typed text)
        syncEditingQuestionFromDOM()
        // validate against the latest editingQuestion (use latest state via callback)
        // because setEditingQuestion is async, read values directly from DOM to validate immediately
        const domQuestionEl = document.querySelector('#edit-question-textarea')
        const questionText = domQuestionEl ? domQuestionEl.value : editingQuestion.question
        const optionNodes = document.querySelectorAll('[data-localid][data-role="option-text"]')
        const newOptions = Array.from(optionNodes).map(node => {
            const localId = node.getAttribute('data-localid')
            const opt = editingQuestion.options.find(o => String(o.__localId) === String(localId))
            return { ...(opt || {}), text: node.value }
        })
        const qToValidate = { ...editingQuestion, question: questionText, options: newOptions }

        const err = validateEditingQuestion(qToValidate)
        if (err) {
            setOptionDeleteError(err)
            return
        }
        setOptionDeleteError(null)

        // build payload from qToValidate
        try {
            const payload = {
                question: qToValidate.question,
                question_no: qToValidate.question_no,
                question_type: qToValidate.question_type,
                points: qToValidate.points,
                quiz_info: quizId,
                options: qToValidate.options.map(o => ({ text: o.text, is_correct: !!o.is_correct }))
            }
            await api.put(`/questions/${qToValidate.id}/`, payload)
            setShowEditModal(false)
            setEditingQuestion(null)
            const payloadQ = await loadQuestionPage(urlPage, undefined)
            setQuestions(payloadQ.questions || [])
            setQuestionsMeta(payloadQ.questions_meta || { page: 1, last_page: 1, total: 0 })
        } catch (err) {
            setOptionDeleteError(formatError(err.response?.data || err.message))
        }
    }

    // Add option to editingQuestion (gives stable __localId)
    const addEditOption = () => {
        if (!editingQuestion) return
        const max = editingQuestion.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
        if (editingQuestion.options.length >= max) return
        setEditingQuestion(prev => ({
            ...prev,
            options: [...prev.options, { text: '', is_correct: false, __localId: genLocalId() }]
        }))
    }

    // Remove option by localId (handles persisted option id deletion)
    const removeEditOption = async (localId) => {
        if (!editingQuestion) return
        const option = editingQuestion.options.find(o => o.__localId === localId)
        if (!option) return

        // validation checks
        const remaining = editingQuestion.options.length - 1
        const requiredCount = editingQuestion.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
        if (remaining < requiredCount) {
            setOptionDeleteError(`Cannot remove option: ${editingQuestion.question_type} requires exactly ${requiredCount} options`)
            return
        }
        const correctCount = editingQuestion.options.filter(o => o.is_correct).length
        const willBeCorrect = option.is_correct ? (correctCount - 1) : correctCount
        if (editingQuestion.question_type === 'single' && willBeCorrect !== 1) {
            setOptionDeleteError('Single choice must have exactly 1 correct option — adjust correct option before deleting.')
            return
        }
        if (editingQuestion.question_type === 'multiple' && willBeCorrect < 1) {
            setOptionDeleteError('Multiple choice must have at least 1 correct option — adjust correct option before deleting.')
            return
        }

        setOptionDeleteError(null)

        if (option.id) {
            setOptionDeleting(true)
            try {
                await api.delete(`/options/${option.id}/`)
                setEditingQuestion(prev => ({ ...prev, options: prev.options.filter(o => o.__localId !== localId) }))
            } catch (err) {
                setOptionDeleteError(formatError(err.response?.data || err.message))
            } finally {
                setOptionDeleting(false)
            }
        } else {
            // local only, just remove
            setEditingQuestion(prev => ({ ...prev, options: prev.options.filter(o => o.__localId !== localId) }))
        }
    }

    // toggle correct by localId (updates state immediately)
    const toggleEditOptionCorrect = (localId, checked) => {
        if (!editingQuestion) return
        if (editingQuestion.question_type === 'single') {
            setEditingQuestion(prev => {
                const opts = prev.options.map(o => ({ ...o, is_correct: o.__localId === localId }))
                return { ...prev, options: opts }
            })
        } else {
            setEditingQuestion(prev => {
                const opts = prev.options.map(o => o.__localId === localId ? { ...o, is_correct: checked } : o)
                return { ...prev, options: opts }
            })
        }
    }

    // change question fields on edit modal (these update state directly)
    const onEditField = (name, value) => {
        setEditingQuestion(prev => ({ ...prev, [name]: value }))
    }

    // Pagination helpers for questions
    const goToQuestionPage = (p) => {
        if (p === 'ellipsis') return
        const params = {}
        if (p > 1) params.question_page = p
        setSearchParams(params, { replace: true })
    }

    const buildPaginationPages = (current, last, siblings = 2) => {
        if (last <= 1) return [1]
        const pages = new Set()
        pages.add(1); if (last >= 2) pages.add(2)
        const start = Math.max(1, current - siblings); const end = Math.min(last, current + siblings)
        for (let p = start; p <= end; p++) pages.add(p)
        if (last - 1 > 2) pages.add(last - 1); if (last > 1) pages.add(last)
        const arr = Array.from(pages).sort((a, b) => a - b); const out = []
        for (let i = 0; i < arr.length; i++) { const cur = arr[i]; const prev = arr[i - 1]; if (i > 0 && cur - prev > 1) out.push('ellipsis'); out.push(cur) }
        return out
    }

    // Edit question modal JSX (uses stable keys, and text inputs are uncontrolled defaultValue)
    function EditQuestionModal() {
        if (!editingQuestion) return null
        const q = editingQuestion
        const maxOptions = q.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
        const canAdd = q.options.length < maxOptions

        return (
            <Modal
                show={showEditModal}
                onHide={() => { setShowEditModal(false); setEditingQuestion(null); setOptionDeleteError(null) }}
                size="lg"
                backdrop="static"
            >
                <Modal.Header closeButton><Modal.Title>Edit question #{q.question_no}</Modal.Title></Modal.Header>
                <Modal.Body>
                    {optionDeleteError && <Alert variant="danger">{optionDeleteError}</Alert>}

                    <Form.Group className="mb-2">
                        <Form.Label>Question text</Form.Label>
                        {/* uncontrolled textarea: defaultValue so typing doesn't update React state every keystroke */}
                        <Form.Control id="edit-question-textarea" as="textarea" rows={3} defaultValue={q.question} />
                    </Form.Group>

                    <Row className="mb-2">
                        <Col md={4}>
                            <Form.Group>
                                <Form.Label>Type</Form.Label>
                                <Form.Select value={q.question_type} onChange={e => onEditField('question_type', e.target.value)}>
                                    <option value="single">single</option>
                                    <option value="multiple">multiple</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={4}>
                            <Form.Group>
                                <Form.Label>Question no</Form.Label>
                                <Form.Control type="number" value={q.question_no} onChange={e => onEditField('question_no', Number(e.target.value) || 1)} />
                            </Form.Group>
                        </Col>
                        <Col md={4}>
                            <Form.Group>
                                <Form.Label>Points</Form.Label>
                                <Form.Control type="number" value={q.points} onChange={e => onEditField('points', Number(e.target.value) || 1)} />
                            </Form.Group>
                        </Col>
                    </Row>

                    <div className="mb-2">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <div><strong>Options ({q.options.length}/{maxOptions})</strong></div>
                            <div>
                                <Button size="sm" variant="outline-secondary" onClick={addEditOption} disabled={!canAdd}>Add option</Button>
                            </div>
                        </div>

                        {q.options.map((opt) => (
                            <InputGroup key={opt.__localId} className="mb-2">
                                <InputGroup.Text>
                                    {q.question_type === 'single' ? (
                                        <Form.Check
                                            type="radio"
                                            name={`radio-${q.id}`}
                                            checked={!!opt.is_correct}
                                            onChange={() => toggleEditOptionCorrect(opt.__localId, true)}
                                        />
                                    ) : (
                                        <Form.Check
                                            type="checkbox"
                                            checked={!!opt.is_correct}
                                            onChange={e => toggleEditOptionCorrect(opt.__localId, e.target.checked)}
                                        />
                                    )}
                                </InputGroup.Text>

                                {/* uncontrolled text input for option text: defaultValue and data-localid for sync */}
                                <Form.Control
                                    defaultValue={opt.text}
                                    data-localid={opt.__localId}
                                    data-role="option-text"
                                    placeholder={`Option`}
                                />

                                <Button variant="outline-danger" onClick={() => removeEditOption(opt.__localId)} disabled={optionDeleting}>
                                    {optionDeleting ? <Spinner animation="border" size="sm" /> : 'Delete'}
                                </Button>
                            </InputGroup>
                        ))}
                    </div>
                </Modal.Body>

                <Modal.Footer>
                    <Button variant="secondary" onClick={() => { setShowEditModal(false); setEditingQuestion(null); setOptionDeleteError(null) }}>Cancel</Button>
                    <Button variant="primary" onClick={saveEditingQuestion}>Save question</Button>
                </Modal.Footer>
            </Modal>
        )
    }

    // --- render ---
    return (
        <div>
            <Row className="mb-3">
                <Col><h3>Edit quiz</h3><div className="small text-muted">Quiz id: {quizId}</div></Col>
                <Col className="text-end"><Button variant="secondary" onClick={() => navigate('/my-quizzes')}>Back</Button></Col>
            </Row>

            <Row className="mb-3">
                <Col>
                    <div className="d-flex gap-2">
                        <Badge bg={step === 1 ? 'primary' : 'secondary'}>1. Info</Badge>
                        <Badge bg={step === 2 ? 'primary' : 'secondary'}>2. Questions</Badge>
                        <Badge bg={step === 3 ? 'primary' : 'secondary'}>3. Review</Badge>
                    </div>
                </Col>
            </Row>

            {step === 1 && (
                <Row>
                    <Col md={8}>
                        <Card>
                            <Card.Body>
                                <Card.Title>Quiz info</Card.Title>
                                {loadingInfo ? <Spinner /> : (
                                    <>
                                        {infoError && <Alert variant="danger">{infoError}</Alert>}
                                        {quizInfo && (
                                            <>
                                                <Form.Group className="mb-2">
                                                    <Form.Label>Name</Form.Label>
                                                    <Form.Control name="name" value={quizInfo.name || ''} onChange={onChangeInfo} />
                                                </Form.Group>

                                                <Form.Group className="mb-2">
                                                    <Form.Label>Category</Form.Label>
                                                    <Form.Select name="category" value={quizInfo.category?.id || ''} onChange={(e) => {
                                                        const id = e.target.value
                                                        const cat = categories.find(c => c.id === id)
                                                        setQuizInfo(prev => ({ ...prev, category: cat || { id } }))
                                                    }}>
                                                        <option value="">-- choose --</option>
                                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </Form.Select>
                                                </Form.Group>

                                                <Form.Group className="mb-2">
                                                    <Form.Label>Time limit (seconds)</Form.Label>
                                                    <Form.Control type="number" name="time_limit" min={30} value={quizInfo.time_limit || 0} onChange={onChangeInfo} />
                                                </Form.Group>

                                                <div className="d-flex justify-content-end gap-2 mt-3">
                                                    <Button variant="secondary" onClick={() => setStep(2)}>Next: Questions</Button>
                                                    <Button variant="primary" onClick={saveQuizInfo} disabled={savingInfo}>
                                                        {savingInfo ? (<><Spinner animation="border" size="sm" /> Saving...</>) : 'Save Info'}
                                                    </Button>
                                                </div>
                                                {saveInfoMsg && <div className="mt-2 text-success">{saveInfoMsg}</div>}
                                            </>
                                        )}
                                    </>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>

                    <Col md={4}>
                        <Card>
                            <Card.Body>
                                <Card.Title>Summary</Card.Title>
                                {quizInfo ? (
                                    <>
                                        <div><strong>{quizInfo.name}</strong></div>
                                        <div className="small text-muted">Category: {quizInfo.category?.name}</div>
                                        <div className="small text-muted">Max score: {quizInfo.max_score ?? '-'}</div>
                                    </>
                                ) : <div className="text-muted">Loading...</div>}
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}

            {step === 2 && (
                <Row>
                    <Col md={8}>
                        <Card className="mb-3">
                            <Card.Body>
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <div><strong>Questions</strong> <span className="text-muted small">({questionsMeta.total} total)</span></div>
                                    <div className="d-flex gap-2 align-items-center">
                                        <Button variant="secondary" size="sm" onClick={() => setStep(1)}>Back to Info</Button>
                                        <Button variant="primary" size="sm" onClick={() => setStep(3)}>Review</Button>
                                    </div>
                                </div>

                                {questionsLoading ? (
                                    <div className="text-center"><Spinner /></div>
                                ) : questionsError ? (
                                    <Alert variant="danger">{questionsError}</Alert>
                                ) : questions.length === 0 ? (
                                    <div className="text-muted">No questions on this page.</div>
                                ) : (
                                    <>
                                        {questions.map(q => (
                                            <Card key={q.id} className="mb-2">
                                                <Card.Body>
                                                    <Row>
                                                        <Col md={8}>
                                                            <strong>#{q.question_no}</strong> {q.question}
                                                            <div className="small text-muted">Type: {q.question_type} — Points: {q.points}</div>
                                                            <ul>
                                                                {(q.options || []).map(o => <li key={o.id}>{o.text} {o.is_correct ? <Badge bg="success" className="ms-2">correct</Badge> : null}</li>)}
                                                            </ul>
                                                        </Col>
                                                        <Col md={4} className="d-flex flex-column justify-content-between align-items-end">
                                                            <div className="text-end small text-muted">Options: {q.options_meta?.total ?? (q.options?.length ?? 0)}</div>
                                                            <div className="d-flex gap-2">
                                                                <Button size="sm" variant="outline-primary" onClick={() => openEditQuestion(q)}>Edit</Button>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                </Card.Body>
                                            </Card>
                                        ))}

                                        <div className="mt-3 d-flex justify-content-center">
                                            <Pagination>
                                                <Pagination.First onClick={() => goToQuestionPage(1)} disabled={questionsMeta.page <= 1} />
                                                <Pagination.Prev onClick={() => goToQuestionPage(Math.max(1, questionsMeta.page - 1))} disabled={questionsMeta.page <= 1} />
                                                {buildPaginationPages(questionsMeta.page, questionsMeta.last_page, 1).map((p, idx) => (
                                                    p === 'ellipsis' ? <Pagination.Ellipsis key={'e' + idx} disabled /> :
                                                        <Pagination.Item key={p} active={p === questionsMeta.page} onClick={() => goToQuestionPage(p)}>{p}</Pagination.Item>
                                                ))}
                                                <Pagination.Next onClick={() => goToQuestionPage(Math.min(questionsMeta.last_page, questionsMeta.page + 1))} disabled={questionsMeta.page >= questionsMeta.last_page} />
                                                <Pagination.Last onClick={() => goToQuestionPage(questionsMeta.last_page)} disabled={questionsMeta.page >= questionsMeta.last_page} />
                                            </Pagination>
                                        </div>

                                        <div className="mt-2 d-flex justify-content-center">
                                            <InputGroup style={{ maxWidth: 220 }}>
                                                <Form.Control placeholder="Go to question page" type="number" min={1} max={questionsMeta.last_page}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            const v = Number(e.target.value)
                                                            if (v >= 1 && v <= questionsMeta.last_page) goToQuestionPage(v)
                                                        }
                                                    }} />
                                                <Button onClick={() => {
                                                    const el = document.querySelector('input[placeholder="Go to question page"]')
                                                    if (!el) return
                                                    const v = Number(el.value)
                                                    if (v >= 1 && v <= questionsMeta.last_page) goToQuestionPage(v)
                                                }}>Go</Button>
                                            </InputGroup>
                                        </div>
                                    </>
                                )}
                            </Card.Body>
                        </Card>
                        <EditQuestionModal />
                    </Col>

                    <Col md={4}>
                        <Card>
                            <Card.Body>
                                <Card.Title>Quiz summary</Card.Title>
                                <div><strong>{quizInfo?.name}</strong></div>
                                <div className="small text-muted">Category: {quizInfo?.category?.name}</div>
                                <div className="small text-muted">Total Questions: {questionsMeta.total}</div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}

            {step === 3 && (
                <Row>
                    <Col md={8}>
                        <Card>
                            <Card.Body>
                                <Card.Title>Review</Card.Title>
                                <div className="mb-3">
                                    <strong>{quizInfo?.name}</strong>
                                    <div className="small text-muted">Category: {quizInfo?.category?.name}</div>
                                </div>

                                <div>
                                    {questions.map(q => (
                                        <Card key={q.id} className="mb-2">
                                            <Card.Body>
                                                <strong>#{q.question_no}</strong> {q.question}
                                                <div className="small text-muted">Type: {q.question_type}</div>
                                            </Card.Body>
                                        </Card>
                                    ))}
                                </div>

                                <div className="d-flex justify-content-between mt-3">
                                    <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
                                    <Button variant="primary" onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Done</Button>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}
        </div>
    )
}
