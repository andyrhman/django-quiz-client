import React, { useEffect, useState, useCallback } from 'react'
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
const genLocalId = () => Math.random().toString(36).slice(2, 9)

/* -------------------------
   Memoized Option Row
   ------------------------- */
const OptionRow = React.memo(function OptionRow({
    opt,
    questionType,
    onText,
    onCorrect,
    onRemove,
    busy
}) {
    return (
        <InputGroup key={opt.__localId} className="mb-2">
            <InputGroup.Text style={{ minWidth: 46 }}>
                {questionType === 'single' ? (
                    <Form.Check
                        type="radio"
                        name={`radio-${opt.__localId}-group`}
                        checked={!!opt.is_correct}
                        onChange={() => onCorrect(opt.__localId, true)}
                    />
                ) : (
                    <Form.Check
                        type="checkbox"
                        checked={!!opt.is_correct}
                        onChange={(e) => onCorrect(opt.__localId, e.target.checked)}
                    />
                )}
            </InputGroup.Text>

            <Form.Control value={opt.text} onChange={(e) => onText(opt.__localId, e.target.value)} placeholder="Option text" />

            <Button variant="outline-danger" onClick={() => onRemove(opt.__localId)} disabled={busy}>
                {busy ? <Spinner animation="border" size="sm" /> : 'Delete'}
            </Button>
        </InputGroup>
    )
})

/* -------------------------
   Memoized EditQuestionModal
   ------------------------- */
const EditQuestionModal = React.memo(function EditQuestionModal({
    show,
    onHide,
    editingQuestion,
    isCreateMode,
    setEditField,
    setOptionText,
    setOptionCorrect,
    addEditOption,
    removeEditOption,
    optionBusy,
    optionError,
    saveEditingQuestion,
    savingQuestion,
    onChangeQuestionType
}) {
    if (!editingQuestion) return null
    const q = editingQuestion
    const maxOptions = q.question_type === 'single' ? MAX_SINGLE : MAX_MULTI

    return (
        <Modal show={show} onHide={onHide} size="lg" backdrop="static">
            <Modal.Header closeButton>
                <Modal.Title>{isCreateMode ? 'Add question' : `Edit question #${q.question_no}`}</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {optionError && <Alert variant="danger">{optionError}</Alert>}

                <Form.Group className="mb-2">
                    <Form.Label>Question text</Form.Label>
                    <Form.Control as="textarea" rows={3} value={q.question} onChange={e => setEditField('question', e.target.value)} />
                </Form.Group>

                {/* explanation textarea */}
                <Form.Group className="mb-2">
                    <Form.Label>Explanation (optional)</Form.Label>
                    <Form.Control as="textarea" rows={2} value={q.explanation || ''} onChange={e => setEditField('explanation', e.target.value)} placeholder="Explain the answer..." />
                </Form.Group>

                <Row className="mb-2">
                    <Col md={4}>
                        <Form.Group>
                            <Form.Label>Type</Form.Label>
                            <Form.Select value={q.question_type} onChange={e => onChangeQuestionType(e.target.value)}>
                                <option value="single">single</option>
                                <option value="multiple">multiple</option>
                            </Form.Select>
                        </Form.Group>
                    </Col>
                    <Col md={4}>
                        <Form.Group>
                            <Form.Label>Question no</Form.Label>
                            <Form.Control type="number" value={q.question_no} onChange={e => setEditField('question_no', Number(e.target.value || 1))} min={1} />
                        </Form.Group>
                    </Col>
                    <Col md={4}>
                        <Form.Group>
                            <Form.Label>Points</Form.Label>
                            <Form.Control type="number" value={q.points} onChange={e => setEditField('points', Number(e.target.value || 1))} min={1} />
                        </Form.Group>
                    </Col>
                </Row>

                <div className="mb-2">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <div><strong>Options ({q.options.length}/{maxOptions})</strong></div>
                        <div>
                            <Button size="sm" variant="outline-secondary" onClick={addEditOption} disabled={q.options.length >= maxOptions}>Add option</Button>
                        </div>
                    </div>

                    {q.options.map(opt => (
                        <OptionRow
                            key={opt.__localId}
                            opt={opt}
                            questionType={q.question_type}
                            onText={setOptionText}
                            onCorrect={setOptionCorrect}
                            onRemove={removeEditOption}
                            busy={optionBusy}
                        />
                    ))}
                </div>
            </Modal.Body>

            <Modal.Footer>
                <Button variant="secondary" onClick={onHide} disabled={savingQuestion}>Cancel</Button>
                <Button variant="primary" onClick={saveEditingQuestion} disabled={savingQuestion}>
                    {savingQuestion ? (<><Spinner size="sm" animation="border" /> {isCreateMode ? 'Creating...' : 'Saving...'}</>) : (isCreateMode ? 'Create' : 'Save')}
                </Button>
            </Modal.Footer>
        </Modal>
    )
})

/* -------------------------
   Small Delete modal
   ------------------------- */
function DeleteQuestionModal({ show, onHide, confirmDelete, deleting, deleteError }) {
    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton><Modal.Title>Delete question</Modal.Title></Modal.Header>
            <Modal.Body>
                Are you sure you want to delete this question? This action cannot be undone.
                {deleteError && <div className="text-danger mt-2">{deleteError}</div>}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide} disabled={deleting}>Cancel</Button>
                <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
                    {deleting ? (<><Spinner size="sm" animation="border" /> Deleting...</>) : 'Delete'}
                </Button>
            </Modal.Footer>
        </Modal>
    )
}

/* -------------------------
   Main Page Component
   ------------------------- */
export default function EditQuizPage() {
    const { quizId } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()

    const [step, setStep] = useState(1)

    const [quizInfo, setQuizInfo] = useState(null)
    const [categories, setCategories] = useState([])
    const [loadingInfo, setLoadingInfo] = useState(true)
    const [infoError, setInfoError] = useState(null)
    const [savingInfo, setSavingInfo] = useState(false)
    const [saveInfoMsg, setSaveInfoMsg] = useState(null)

    const [questions, setQuestions] = useState([])
    const [questionsLoading, setQuestionsLoading] = useState(true)
    const [questionsError, setQuestionsError] = useState(null)
    const [questionsMeta, setQuestionsMeta] = useState({ page: 1, last_page: 1, total: 0 })

    const [showEditModal, setShowEditModal] = useState(false)
    const [editingQuestion, setEditingQuestion] = useState(null)
    const [isCreateMode, setIsCreateMode] = useState(false)

    const [optionBusy, setOptionBusy] = useState(false)
    const [optionError, setOptionError] = useState(null)

    const [savingQuestion, setSavingQuestion] = useState(false) // spinner state for create/update

    const [showDeleteQuestionModal, setShowDeleteQuestionModal] = useState(false)
    const [deletingQuestionId, setDeletingQuestionId] = useState(null)
    const [deletingQuestion, setDeletingQuestion] = useState(false)
    const [deleteQuestionError, setDeleteQuestionError] = useState(null)

    const loadCategories = useCallback(async (signal) => {
        const res = await api.get('/categories/', { signal })
        return res.data || []
    }, [])

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

    // NOTE: use the preview endpoint (server returns `explanation` in questions)
    const loadQuestionPage = useCallback(async (pageNum = 1, signal) => {
        const params = {}
        if (pageNum > 1) params.question_page = pageNum
        const res = await api.get(`/quizinfo/preview/${quizId}/with-questions-explanation/`, { params, signal })
        return res.data
    }, [quizId])

    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        async function init() {
            try {
                const cats = await loadCategories(controller.signal)
                if (!cancelled) setCategories(cats)
            } catch (err) {
                if (!cancelled) console.warn('Failed loading categories', err)
            }
        }
        init()
        return () => { cancelled = true; controller.abort() }
    }, [loadCategories])

    useEffect(() => { loadQuizInfo() }, [loadQuizInfo])

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

    const onChangeInfo = useCallback((e) => {
        const { name, value } = e.target
        setQuizInfo(prev => ({ ...prev, [name]: name === 'time_limit' ? Number(value) : value }))
        setSaveInfoMsg(null)
    }, [])

    const saveQuizInfo = useCallback(async () => {
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
    }, [quizInfo, quizId, loadQuizInfo])

    const normalizeOptionsForEdit = useCallback((opts, requiredCount) => {
        const arr = (opts || []).map(o => ({
            id: o.id,
            text: o.text ?? '',
            is_correct: !!o.is_correct,
            __localId: o.__localId || o.id || genLocalId()
        }))
        while (arr.length < requiredCount) arr.push({ text: '', is_correct: false, __localId: genLocalId() })
        if (arr.length > requiredCount) arr.splice(requiredCount)
        return arr
    }, [])

    const openEditQuestion = useCallback((q) => {
        const required = q.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
        setEditingQuestion({
            id: q.id,
            question: q.question || '',
            explanation: q.explanation || '',
            question_no: q.question_no || 1,
            question_type: q.question_type || 'single',
            points: q.points || 1,
            quiz_info: quizId,
            options: normalizeOptionsForEdit(q.options, required)
        })
        setIsCreateMode(false)
        setOptionError(null)
        setShowEditModal(true)
    }, [normalizeOptionsForEdit, quizId])

    const openAddQuestion = useCallback(() => {
        const nextNo = (questionsMeta.total || 0) + 1
        const defaultType = 'single'
        setEditingQuestion({
            id: undefined,
            question: '',
            explanation: '',
            question_no: nextNo,
            question_type: defaultType,
            points: 1,
            quiz_info: quizId,
            options: normalizeOptionsForEdit([], defaultType === 'single' ? MAX_SINGLE : MAX_MULTI)
        })
        setIsCreateMode(true)
        setOptionError(null)
        setShowEditModal(true)
    }, [normalizeOptionsForEdit, questionsMeta.total, quizId])

    const setEditField = useCallback((name, value) => {
        setEditingQuestion(prev => ({ ...prev, [name]: value }))
    }, [])

    const setOptionText = useCallback((localId, text) => {
        setEditingQuestion(prev => prev ? ({ ...prev, options: prev.options.map(o => o.__localId === localId ? { ...o, text } : o) }) : prev)
    }, [])

    const setOptionCorrect = useCallback((localId, checked) => {
        setEditingQuestion(prev => {
            if (!prev) return prev
            if (prev.question_type === 'single') {
                return ({ ...prev, options: prev.options.map(o => ({ ...o, is_correct: o.__localId === localId })) })
            } else {
                return ({ ...prev, options: prev.options.map(o => o.__localId === localId ? { ...o, is_correct: checked } : o) })
            }
        })
    }, [])

    const addEditOption = useCallback(() => {
        setEditingQuestion(prev => {
            if (!prev) return prev
            const max = prev.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
            if (prev.options.length >= max) return prev
            return { ...prev, options: [...prev.options, { text: '', is_correct: false, __localId: genLocalId() }] }
        })
    }, [])

    const removeEditOption = useCallback(async (localId) => {
        const prev = editingQuestion
        if (!prev) return
        const opt = prev.options.find(o => o.__localId === localId)
        if (!opt) return
        const required = prev.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
        if (prev.options.length - 1 < required) {
            setOptionError(`Cannot remove option: ${prev.question_type} requires exactly ${required} options`)
            return
        }
        const correctCount = prev.options.filter(o => o.is_correct).length
        const willBeCorrect = opt.is_correct ? (correctCount - 1) : correctCount
        if (prev.question_type === 'single' && willBeCorrect !== 1) {
            setOptionError('Single choice must have exactly 1 correct option — adjust correct option before deleting.')
            return
        }
        if (prev.question_type === 'multiple' && willBeCorrect < 1) {
            setOptionError('Multiple choice must have at least 1 correct option — adjust correct option before deleting.')
            return
        }
        setOptionError(null)

        if (opt.id) {
            setOptionBusy(true)
            try {
                await api.delete(`/options/${opt.id}/`)
                setEditingQuestion(prev2 => ({ ...prev2, options: prev2.options.filter(o => o.__localId !== localId) }))
            } catch (err) {
                setOptionError(formatError(err.response?.data || err.message))
            } finally {
                setOptionBusy(false)
            }
        } else {
            setEditingQuestion(prev2 => ({ ...prev2, options: prev2.options.filter(o => o.__localId !== localId) }))
        }
    }, [editingQuestion])

    const onChangeQuestionType = useCallback((newType) => {
        if (!editingQuestion) return
        const required = newType === 'single' ? MAX_SINGLE : MAX_MULTI
        setEditingQuestion(prev => {
            if (!prev) return prev
            let opts = [...prev.options]
            if (opts.length < required) {
                while (opts.length < required) opts.push({ text: '', is_correct: false, __localId: genLocalId() })
            } else if (opts.length > required) {
                opts = opts.slice(0, required)
            }
            if (newType === 'single') {
                const found = opts.find(o => o.is_correct)
                if (!found && opts.length > 0) opts[0].is_correct = true
                else if (found) opts = opts.map(o => ({ ...o, is_correct: o.__localId === found.__localId }))
            }
            return { ...prev, question_type: newType, options: opts }
        })
    }, [editingQuestion])

    const validateEditing = useCallback((q) => {
        if (!q) return 'No question'
        if (!q.question || !q.question.trim()) return 'Question text required'
        if (!Number.isInteger(Number(q.question_no)) || Number(q.question_no) <= 0) return 'Question no must be positive integer'
        if (!Number.isInteger(Number(q.points)) || Number(q.points) <= 0) return 'Points must be positive integer'
        const required = q.question_type === 'single' ? MAX_SINGLE : MAX_MULTI
        if ((q.options || []).length !== required) return `This question type requires exactly ${required} options`
        if (q.question_type === 'single') {
            const c = q.options.filter(o => o.is_correct).length
            if (c !== 1) return 'Single choice must have exactly 1 correct option'
        } else {
            const c = q.options.filter(o => o.is_correct).length
            if (c < 1) return 'Multiple choice must have at least 1 correct option'
        }
        for (const o of q.options) {
            if (!o.text || !o.text.trim()) return 'All options must have text'
        }
        return null
    }, [])

    const saveEditingQuestion = useCallback(async () => {
        if (!editingQuestion) return
        setOptionError(null)
        setSavingQuestion(true)
        const q = {
            question: editingQuestion.question,
            explanation: editingQuestion.explanation || '',
            question_no: Number(editingQuestion.question_no),
            question_type: editingQuestion.question_type,
            points: Number(editingQuestion.points),
            quiz_info: quizId,
            options: editingQuestion.options.map(o => {
                const base = { text: o.text, is_correct: !!o.is_correct }
                if (o.id) base.id = o.id
                return base
            })
        }

        const err = validateEditing(q)
        if (err) {
            setOptionError(err)
            setSavingQuestion(false)
            return
        }

        try {
            if (isCreateMode || !editingQuestion.id) {
                await api.post('/questions/', q)
                setSearchParams({ question_page: 1 }, { replace: true })
                const payload = await loadQuestionPage(1)
                setQuestions(payload.questions || [])
                setQuestionsMeta(payload.questions_meta || { page: 1, last_page: 1, total: 0 })
                setShowEditModal(false)
                setEditingQuestion(null)
                setIsCreateMode(false)
            } else {
                await api.put(`/questions/${editingQuestion.id}/`, q)
                const payload = await loadQuestionPage(urlPage)
                setQuestions(payload.questions || [])
                setQuestionsMeta(payload.questions_meta || { page: 1, last_page: 1, total: 0 })
                setShowEditModal(false)
                setEditingQuestion(null)
            }
        } catch (e) {
            setOptionError(formatError(e.response?.data || e.message))
        } finally {
            setSavingQuestion(false)
        }
    }, [editingQuestion, isCreateMode, quizId, validateEditing, loadQuestionPage, urlPage, setSearchParams])

    const confirmDeleteQuestion = useCallback((id) => {
        setDeletingQuestionId(id)
        setDeleteQuestionError(null)
        setShowDeleteQuestionModal(true)
    }, [])

    const doDeleteQuestion = useCallback(async () => {
        if (!deletingQuestionId) return
        setDeletingQuestion(true)
        setDeleteQuestionError(null)
        try {
            await api.delete(`/questions/${deletingQuestionId}/`)
            setShowDeleteQuestionModal(false)
            setSearchParams({ question_page: 1 }, { replace: true })
            const payload = await loadQuestionPage(1)
            setQuestions(payload.questions || [])
            setQuestionsMeta(payload.questions_meta || { page: 1, last_page: 1, total: 0 })
            setDeletingQuestionId(null)
        } catch (err) {
            setDeleteQuestionError(formatError(err.response?.data || err.message))
        } finally {
            setDeletingQuestion(false)
        }
    }, [deletingQuestionId, loadQuestionPage, setSearchParams])

    const goToQuestionPage = useCallback((p) => {
        if (p === 'ellipsis') return
        const params = {}
        if (p > 1) params.question_page = p
        setSearchParams(params, { replace: true })
    }, [setSearchParams])

    const buildPaginationPages = useCallback((current, last, siblings = 2) => {
        if (last <= 1) return [1]
        const pages = new Set()
        pages.add(1); if (last >= 2) pages.add(2)
        const start = Math.max(1, current - siblings); const end = Math.min(last, current + siblings)
        for (let p = start; p <= end; p++) pages.add(p)
        if (last - 1 > 2) pages.add(last - 1); if (last > 1) pages.add(last)
        const arr = Array.from(pages).sort((a, b) => a - b); const out = []
        for (let i = 0; i < arr.length; i++) { const cur = arr[i]; const prev = arr[i - 1]; if (i > 0 && cur - prev > 1) out.push('ellipsis'); out.push(cur) }
        return out
    }, [])

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
                                                <Form.Group className="mb-2"><Form.Label>Name</Form.Label><Form.Control name="name" value={quizInfo.name || ''} onChange={onChangeInfo} /></Form.Group>
                                                <Form.Group className="mb-2"><Form.Label>Category</Form.Label>
                                                    <Form.Select name="category" value={quizInfo.category?.id || ''} onChange={(e) => {
                                                        const id = e.target.value
                                                        const cat = categories.find(c => c.id === id)
                                                        setQuizInfo(prev => ({ ...prev, category: cat || { id } }))
                                                    }}>
                                                        <option value="">-- choose --</option>
                                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </Form.Select>
                                                </Form.Group>
                                                <Form.Group className="mb-2"><Form.Label>Time limit (seconds)</Form.Label><Form.Control type="number" name="time_limit" min={30} value={quizInfo.time_limit || 0} onChange={onChangeInfo} /></Form.Group>
                                                <div className="d-flex justify-content-end gap-2 mt-3">
                                                    <Button variant="secondary" onClick={() => setStep(2)}>Next: Questions</Button>
                                                    <Button variant="primary" onClick={saveQuizInfo} disabled={savingInfo}>{savingInfo ? (<><Spinner animation="border" size="sm" /> Saving...</>) : 'Save Info'}</Button>
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
                                {quizInfo ? (<><div><strong>{quizInfo.name}</strong></div><div className="small text-muted">Category: {quizInfo.category?.name}</div><div className="small text-muted">Max score: {quizInfo.max_score ?? '-'}</div></>) : <div className="text-muted">Loading...</div>}
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
                                        <Button variant="success" size="sm" onClick={openAddQuestion}>Add Question</Button>
                                    </div>
                                </div>

                                {questionsLoading ? (<div className="text-center"><Spinner /></div>) : questionsError ? (<Alert variant="danger">{questionsError}</Alert>) : questions.length === 0 ? (<div className="text-muted">No questions on this page.</div>) : (
                                    <>
                                        {questions.map(q => (
                                            <Card key={q.id} className="mb-2">
                                                <Card.Body>
                                                    <Row>
                                                        <Col md={8}>
                                                            <strong>#{q.question_no}</strong> {q.question}
                                                            <div className="small text-muted">Type: {q.question_type} — Points: {q.points}</div>
                                                            {q.explanation && <div className="mt-2"><strong>Explanation:</strong> <div className="small text-muted">{q.explanation}</div></div>}
                                                            <ul>{(q.options || []).map(o => <li key={o.id}>{o.text} {o.is_correct ? <Badge bg="success" className="ms-2">correct</Badge> : null}</li>)}</ul>
                                                        </Col>
                                                        <Col md={4} className="d-flex flex-column justify-content-between align-items-end">
                                                            <div className="text-end small text-muted">Options: {q.options_meta?.total ?? (q.options?.length ?? 0)}</div>
                                                            <div className="d-flex gap-2">
                                                                <Button size="sm" variant="outline-primary" onClick={() => openEditQuestion(q)}>Edit</Button>
                                                                <Button size="sm" variant="outline-danger" onClick={() => confirmDeleteQuestion(q.id)}>Delete</Button>
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
                                    </>
                                )}
                            </Card.Body>
                        </Card>

                        <EditQuestionModal
                            show={showEditModal}
                            onHide={() => { setShowEditModal(false); setEditingQuestion(null); setOptionError(null); setIsCreateMode(false) }}
                            editingQuestion={editingQuestion}
                            isCreateMode={isCreateMode}
                            setEditField={(name, value) => {
                                if (name === 'question_type') onChangeQuestionType(value)
                                else setEditField(name, value)
                            }}
                            setOptionText={setOptionText}
                            setOptionCorrect={setOptionCorrect}
                            addEditOption={addEditOption}
                            removeEditOption={removeEditOption}
                            optionBusy={optionBusy}
                            optionError={optionError}
                            saveEditingQuestion={saveEditingQuestion}
                            savingQuestion={savingQuestion}
                            onChangeQuestionType={onChangeQuestionType}
                        />

                        <DeleteQuestionModal
                            show={showDeleteQuestionModal}
                            onHide={() => setShowDeleteQuestionModal(false)}
                            confirmDelete={doDeleteQuestion}
                            deleting={deletingQuestion}
                            deleteError={deleteQuestionError}
                        />
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
                                <div className="mb-3"><strong>{quizInfo?.name}</strong><div className="small text-muted">Category: {quizInfo?.category?.name}</div><div className="small text-muted">Max score: {quizInfo?.max_score ?? '-'}</div></div>
                                {questionsLoading ? <div className="text-center"><Spinner /></div> : questionsError ? <Alert variant="danger">{questionsError}</Alert> : questions.length === 0 ? <div className="text-muted">No questions on this page.</div> : (
                                    <>
                                        {questions.map(q => (
                                            <Card key={q.id} className="mb-2">
                                                <Card.Body>
                                                    <Row>
                                                        <Col md={8}>
                                                            <strong>#{q.question_no}</strong> {q.question}
                                                            <div className="small text-muted">Type: {q.question_type} — Points: {q.points}</div>
                                                            {q.explanation && <div className="mt-2"><strong>Explanation:</strong> <div className="small text-muted">{q.explanation}</div></div>}
                                                            <ul>{(q.options || []).map(o => <li key={o.id}>{o.text} {o.is_correct ? <Badge bg="success" className="ms-2">correct</Badge> : null}</li>)}</ul>
                                                        </Col>
                                                        <Col md={4} className="d-flex flex-column justify-content-between align-items-end">
                                                            <div className="text-end small text-muted">Options: {q.options_meta?.total ?? (q.options?.length ?? 0)}</div>
                                                            <div className="d-flex gap-2">
                                                                <Button size="sm" variant="outline-primary" onClick={() => openEditQuestion(q)}>Edit</Button>
                                                                <Button size="sm" variant="outline-danger" onClick={() => confirmDeleteQuestion(q.id)}>Delete</Button>
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
                                                    p === 'ellipsis' ? <Pagination.Ellipsis key={'er' + idx} disabled /> :
                                                        <Pagination.Item key={'er-' + p} active={p === questionsMeta.page} onClick={() => goToQuestionPage(p)}>{p}</Pagination.Item>
                                                ))}
                                                <Pagination.Next onClick={() => goToQuestionPage(Math.min(questionsMeta.last_page, questionsMeta.page + 1))} disabled={questionsMeta.page >= questionsMeta.last_page} />
                                                <Pagination.Last onClick={() => goToQuestionPage(questionsMeta.last_page)} disabled={questionsMeta.page >= questionsMeta.last_page} />
                                            </Pagination>
                                        </div>
                                    </>
                                )}
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
