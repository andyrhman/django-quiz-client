import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Form, Button, Alert, Badge, Spinner, InputGroup, ButtonGroup } from 'react-bootstrap'
import api from '../api/axios'
import { useNavigate } from 'react-router-dom'

// small formatter for server errors (if you already have utils/formatError, replace with import)
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

/**
 * Page: Create Quiz (3 steps)
 * Step 1: Quiz Info (name, time limit, category) — saved to temp state (not posted yet)
 * Step 2: Questions builder — add multiple questions (auto question_no), options per question
 * Step 3: Review & Submit — POST quizinfo, then POST questions
 */

const MAX_OPTIONS_SINGLE = 4
const MAX_OPTIONS_MULTI = 5

export default function CreateQuizPage() {
    const navigate = useNavigate()

    // UI step
    const [step, setStep] = useState(1)

    // categories for select
    const [categories, setCategories] = useState([])
    const [loadingCategories, setLoadingCategories] = useState(false)
    const [categoriesError, setCategoriesError] = useState(null)

    // quiz info temp
    const [quizTemp, setQuizTemp] = useState({
        name: '',
        time_limit: 60, // minutes (UI uses minutes; will convert to seconds when sending)
        category: '' // category id
    })

    const [quizInfoError, setQuizInfoError] = useState(null)

    // questions temp array
    const [questions, setQuestions] = useState([])

    // currently editing question (works as draft before "Add Question" pressed)
    const [draft, setDraft] = useState(makeEmptyDraft(1))

    // submit state
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState(null)
    const [submitSuccess, setSubmitSuccess] = useState(null)

    // load categories once
    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        async function load() {
            setLoadingCategories(true)
            setCategoriesError(null)
            try {
                const res = await api.get('/categories/', { signal: controller.signal })
                if (!cancelled) setCategories(res.data || [])
            } catch (err) {
                if (!cancelled) setCategoriesError(formatError(err.response?.data || err.message))
            } finally {
                if (!cancelled) setLoadingCategories(false)
            }
        }
        load()
        return () => { cancelled = true; controller.abort() }
    }, [])

    // helper: create a fresh draft object with given question_no
    function makeEmptyDraft(question_no = 1) {
        return {
            question: '',
            question_no,
            question_type: 'single', // 'single' or 'multiple'
            points: 1,
            options: [] // each option: { text: '', is_correct: false }
        }
    }

    // --- Quiz info handlers ---
    const onQuizTempChange = (e) => {
        const { name, value } = e.target
        // keep time_limit in minutes in local state
        setQuizTemp(prev => ({ ...prev, [name]: name === 'time_limit' ? Number(value) : value }))
        setQuizInfoError(null)
    }

    const validateQuizInfo = () => {
        if (!quizTemp.name.trim()) return 'Quiz name is required'
        if (!quizTemp.category) return 'Category is required'
        if (!Number.isInteger(quizTemp.time_limit) || quizTemp.time_limit <= 0) return 'Time limit must be a positive integer (minutes)'
        return null
    }

    // proceed to next step (validation for step 1)
    const goToStep2 = () => {
        const v = validateQuizInfo()
        if (v) {
            setQuizInfoError(v)
            return
        }
        // prepare draft question numbering starting at 1 + existing questions length
        setDraft(makeEmptyDraft(questions.length + 1))
        setStep(2)
    }

    // back navigation
    const back = () => {
        setSubmitError(null)
        setSubmitSuccess(null)
        setStep(prev => Math.max(1, prev - 1))
    }

    // --- Question builders ---
    // change draft fields
    const onDraftChange = (field, value) => {
        // if question_type changes, reset options to empty to avoid leftover counts
        if (field === 'question_type') {
            setDraft(prev => ({ ...prev, question_type: value, options: [] }))
            return
        }
        setDraft(prev => ({ ...prev, [field]: value }))
    }

    // add option to draft
    const addDraftOption = () => {
        const max = draft.question_type === 'single' ? MAX_OPTIONS_SINGLE : MAX_OPTIONS_MULTI
        if (draft.options.length >= max) return
        setDraft(prev => ({ ...prev, options: [...prev.options, { text: '', is_correct: false }] }))
    }

    // remove option by index
    const removeDraftOption = (idx) => {
        setDraft(prev => {
            const opts = prev.options.slice()
            opts.splice(idx, 1)
            // if single and removed the checked one, ensure none selected
            return { ...prev, options: opts }
        })
    }

    // change option text
    const onDraftOptionText = (idx, text) => {
        setDraft(prev => {
            const opts = prev.options.slice()
            opts[idx] = { ...opts[idx], text }
            return { ...prev, options: opts }
        })
    }

    // toggle or set correct for option
    const setDraftOptionCorrect = (idx, isChecked) => {
        if (draft.question_type === 'single') {
            // single: only one correct — set the chosen one true, others false
            setDraft(prev => {
                const opts = prev.options.map((o, i) => ({ ...o, is_correct: i === idx }))
                return { ...prev, options: opts }
            })
        } else {
            // multiple: toggle this option
            setDraft(prev => {
                const opts = prev.options.slice()
                opts[idx] = { ...opts[idx], is_correct: isChecked }
                return { ...prev, options: opts }
            })
        }
    }

    // validation for a draft question before adding
    const validateDraft = () => {
        if (!draft.question.trim()) return 'Question text is required'
        if (!Number.isInteger(draft.points) || draft.points <= 0) return 'Points must be a positive integer'
        const needed = draft.question_type === 'single' ? MAX_OPTIONS_SINGLE : MAX_OPTIONS_MULTI
        if (draft.options.length !== needed) return `This question type requires exactly ${needed} options`
        if (draft.question_type === 'single') {
            const correctCount = draft.options.filter(o => o.is_correct).length
            if (correctCount !== 1) return 'Single choice question must have exactly one correct option'
        } else {
            const correctCount = draft.options.filter(o => o.is_correct).length
            if (correctCount < 1) return 'Multiple choice question must have at least one correct option'
        }
        // ensure every option has non-empty text
        for (const o of draft.options) {
            if (!o.text.trim()) return 'All options must have text'
        }
        return null
    }

    // add draft as question to questions array (auto-increment question_no)
    const addQuestion = () => {
        const v = validateDraft()
        if (v) {
            setSubmitError(v)
            return
        }
        setQuestions(prev => [...prev, { ...draft }])
        // create a new blank draft with incremented question_no
        setDraft(makeEmptyDraft(draft.question_no + 1))
        setSubmitError(null)
    }

    // edit existing question by index (move into draft for editing)
    const editQuestion = (idx) => {
        const q = questions[idx]
        if (!q) return
        setDraft({ ...q })
        // remove the original question so that "Add" will essentially replace when user re-adds
        setQuestions(prev => prev.filter((_, i) => i !== idx))
        setStep(2)
    }

    // remove question
    const removeQuestion = (idx) => {
        setQuestions(prev => prev.filter((_, i) => i !== idx))
        // renumber remaining questions' question_no to keep sequential numbering
        setQuestions(prev => prev.map((q, i) => ({ ...q, question_no: i + 1 })))
        // also reset draft question_no if needed
        setDraft(makeEmptyDraft((questions.length > 1) ? questions.length : 1))
    }

    // go to review step
    const goToReview = () => {
        if (questions.length === 0) {
            setSubmitError('Please add at least one question before reviewing/submitting')
            return
        }
        setSubmitError(null)
        setStep(3)
    }

    // Submit all: POST quizinfo then POST questions (sequentially)
    const submitAll = async () => {
        setSubmitting(true)
        setSubmitError(null)
        setSubmitSuccess(null)
        try {
            // 0. validate quiz info again
            const v = validateQuizInfo()
            if (v) { setSubmitError(v); setSubmitting(false); return }

            // 1. Create quiz info
            const quizPayload = {
                name: quizTemp.name,
                // convert minutes -> seconds for the server
                time_limit: quizTemp.time_limit * 60,
                category: quizTemp.category
            }
            const quizRes = await api.post('/quizinfo/', quizPayload)
            const quizCreated = quizRes.data
            const quizId = quizCreated.id

            // 2. Create questions (sequential so server can process easily)
            // We map local question objects to the server shape.
            for (const q of questions) {
                const payload = {
                    question: q.question,
                    question_no: q.question_no,
                    question_type: q.question_type,
                    points: q.points,
                    quiz_info: quizId,
                    options: q.options.map(o => ({ text: o.text, is_correct: !!o.is_correct }))
                }
                // post each question; if any fails we throw and stop
                await api.post('/questions/', payload)
            }

            setSubmitSuccess('Quiz successfully created')
            // redirect to My Quizzes or the created quiz page maybe
            setTimeout(() => {
                navigate('/my-quizzes')
            }, 900)

        } catch (err) {
            console.error(err)
            setSubmitError(formatError(err.response?.data || err.message))
        } finally {
            setSubmitting(false)
        }
    }

    // small UI render helpers
    function DraftEditor() {
        const maxOptions = draft.question_type === 'single' ? MAX_OPTIONS_SINGLE : MAX_OPTIONS_MULTI
        const canAddOption = draft.options.length < maxOptions
        return (
            <Card className="mb-3">
                <Card.Body>
                    <Card.Title>Question #{draft.question_no}</Card.Title>

                    <Form.Group className="mb-2">
                        <Form.Label>Question text</Form.Label>
                        <Form.Control as="textarea" rows={3}
                            value={draft.question}
                            onChange={e => onDraftChange('question', e.target.value)} />
                    </Form.Group>

                    <Row>
                        <Col md={4}>
                            <Form.Group className="mb-2">
                                <Form.Label>Question type</Form.Label>
                                <Form.Select value={draft.question_type} onChange={e => onDraftChange('question_type', e.target.value)}>
                                    <option value="single">Single choice (4 options)</option>
                                    <option value="multiple">Multiple choice (5 options)</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        <Col md={3}>
                            <Form.Group className="mb-2">
                                <Form.Label>Points</Form.Label>
                                <Form.Control type="number" min={1} value={draft.points} onChange={e => onDraftChange('points', Number(e.target.value) || 1)} />
                            </Form.Group>
                        </Col>
                        <Col md={5} className="d-flex align-items-end justify-content-end">
                            <div>
                                <Button variant="outline-secondary" size="sm" onClick={() => addDraftOption()} disabled={!canAddOption}>
                                    Add Option ({draft.options.length}/{maxOptions})
                                </Button>
                            </div>
                        </Col>
                    </Row>

                    <div className="mt-3">
                        {draft.options.map((opt, i) => (
                            <InputGroup className="mb-2" key={i}>
                                <InputGroup.Text>
                                    {draft.question_type === 'single' ? (
                                        <Form.Check
                                            type="radio"
                                            name={`single-correct-${draft.question_no}`}
                                            checked={!!opt.is_correct}
                                            onChange={() => setDraftOptionCorrect(i, true)}
                                        />
                                    ) : (
                                        <Form.Check
                                            type="checkbox"
                                            checked={!!opt.is_correct}
                                            onChange={e => setDraftOptionCorrect(i, e.target.checked)}
                                        />
                                    )}
                                </InputGroup.Text>
                                <Form.Control
                                    placeholder={`Option ${i + 1}`}
                                    value={opt.text}
                                    onChange={e => onDraftOptionText(i, e.target.value)}
                                />
                                <Button variant="outline-danger" onClick={() => removeDraftOption(i)}>Remove</Button>
                            </InputGroup>
                        ))}
                    </div>

                    <div className="d-flex gap-2 mt-3">
                        <Button variant="success" onClick={addQuestion}>Add Question</Button>
                        <Button variant="secondary" onClick={() => { setDraft(makeEmptyDraft(draft.question_no)) }}>Reset</Button>
                    </div>
                </Card.Body>
            </Card>
        )
    }

    // Review panel
    function ReviewPanel() {
        return (
            <Card>
                <Card.Body>
                    <Card.Title>Review & submit</Card.Title>

                    <div className="mb-3">
                        <h5>{quizTemp.name} <Badge bg="secondary" className="ms-2">{categories.find(c => c.id === quizTemp.category)?.name || ''}</Badge></h5>
                        <div className="text-muted small">Time limit: {quizTemp.time_limit} minutes ({quizTemp.time_limit * 60} seconds)</div>
                    </div>

                    <div>
                        <h6>Questions ({questions.length})</h6>
                        {questions.map((q, idx) => (
                            <Card key={idx} className="mb-2">
                                <Card.Body>
                                    <div className="d-flex justify-content-between">
                                        <div>
                                            <strong>#{q.question_no}</strong> {q.question}
                                            <div className="small text-muted">Type: {q.question_type} — Points: {q.points}</div>
                                            <ul className="mt-2">
                                                {q.options.map((o, i) => (
                                                    <li key={i}>{o.text} {o.is_correct ? <Badge bg="success" className="ms-2">correct</Badge> : null}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="d-flex flex-column gap-2">
                                            <Button size="sm" variant="outline-primary" onClick={() => editQuestion(idx)}>Edit</Button>
                                            <Button size="sm" variant="outline-danger" onClick={() => removeQuestion(idx)}>Remove</Button>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        ))}
                    </div>

                    <div className="d-flex justify-content-end gap-2 mt-3">
                        <Button variant="secondary" onClick={back}>Back</Button>
                        <Button variant="primary" onClick={submitAll} disabled={submitting}>
                            {submitting ? (<><Spinner animation="border" size="sm" /> Submitting...</>) : 'Submit Quiz'}
                        </Button>
                    </div>

                </Card.Body>
            </Card>
        )
    }

    // Render per step
    return (
        <div>
            <Row className="mb-3">
                <Col>
                    <h3>Create Quiz</h3>
                    <div className="d-flex gap-2 align-items-center">
                        <Badge bg={step === 1 ? 'primary' : 'secondary'}>1. Quiz Info</Badge>
                        <Badge bg={step === 2 ? 'primary' : 'secondary'}>2. Questions</Badge>
                        <Badge bg={step === 3 ? 'primary' : 'secondary'}>3. Review</Badge>
                    </div>
                </Col>
            </Row>

            <Row>
                <Col md={8}>
                    {step === 1 && (
                        <Card>
                            <Card.Body>
                                <Card.Title>Quiz Info</Card.Title>

                                {quizInfoError && <Alert variant="danger">{quizInfoError}</Alert>}

                                <Form>
                                    <Form.Group className="mb-2">
                                        <Form.Label>Quiz name</Form.Label>
                                        <Form.Control name="name" value={quizTemp.name} onChange={onQuizTempChange} placeholder="e.g. AWS Cloud Practitioner - Simple" />
                                    </Form.Group>

                                    <Form.Group className="mb-2">
                                        <Form.Label>Category</Form.Label>
                                        {loadingCategories ? (
                                            <div><Spinner animation="border" size="sm" /> Loading categories...</div>
                                        ) : categoriesError ? (
                                            <div className="text-danger">{categoriesError}</div>
                                        ) : (
                                            <Form.Select name="category" value={quizTemp.category} onChange={onQuizTempChange}>
                                                <option value="">-- choose a category --</option>
                                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </Form.Select>
                                        )}
                                    </Form.Group>

                                    <Form.Group className="mb-2">
                                        <Form.Label>Time limit (minutes)</Form.Label>
                                        <Form.Control type="number" name="time_limit" min={1} value={quizTemp.time_limit} onChange={onQuizTempChange} />
                                        <Form.Text className="text-muted">Enter time limit in minutes (e.g. 60 = 1 hour). The value will be sent to the server in seconds.</Form.Text>
                                    </Form.Group>

                                    <div className="d-flex justify-content-end gap-2 mt-3">
                                        <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
                                        <Button variant="primary" onClick={goToStep2}>Next: Add Questions</Button>
                                    </div>
                                </Form>
                            </Card.Body>
                        </Card>
                    )}

                    {step === 2 && (
                        <>
                            {DraftEditor()}

                            <Card className="mb-3">
                                <Card.Body>
                                    <Card.Title>Drafted Questions</Card.Title>
                                    {questions.length === 0 ? <div className="text-muted">No questions added yet.</div> : (
                                        questions.map((q, i) => (
                                            <Card key={i} className="mb-2">
                                                <Card.Body>
                                                    <div className="d-flex justify-content-between">
                                                        <div>
                                                            <strong>#{q.question_no}</strong> {q.question}
                                                            <div className="small text-muted">Type: {q.question_type} — Points: {q.points}</div>
                                                        </div>
                                                        <div>
                                                            <Button size="sm" variant="outline-primary" onClick={() => editQuestion(i)} className="me-2">Edit</Button>
                                                            <Button size="sm" variant="outline-danger" onClick={() => removeQuestion(i)}>Delete</Button>
                                                        </div>
                                                    </div>
                                                </Card.Body>
                                            </Card>
                                        ))
                                    )}

                                    <div className="d-flex justify-content-between mt-3">
                                        <Button variant="secondary" onClick={back}>Back</Button>
                                        <div>
                                            <Button variant="outline-secondary" onClick={() => setStep(3)} className="me-2">Go to Review</Button>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        </>
                    )}

                    {step === 3 && (
                        <ReviewPanel />
                    )}

                    {submitError && <Alert className="mt-3" variant="danger">{submitError}</Alert>}
                    {submitSuccess && <Alert className="mt-3" variant="success">{submitSuccess}</Alert>}
                </Col>

                <Col md={4}>
                    <Card>
                        <Card.Body>
                            <Card.Title>Tips</Card.Title>
                            <ul>
                                <li>Step 1: Fill quiz info. We won't submit it until final step.</li>
                                <li>Step 2: Add questions, each will be auto-numbered.</li>
                                <li>Single choice questions require exactly {MAX_OPTIONS_SINGLE} options (1 correct).</li>
                                <li>Multiple choice questions require exactly {MAX_OPTIONS_MULTI} options ({'>'}=1 correct).</li>
                                <li>Time limit is entered in minutes in the form; it will be converted to seconds when submitted.</li>
                            </ul>
                        </Card.Body>
                    </Card>

                    <Card className="mt-3">
                        <Card.Body>
                            <Card.Title>Progress</Card.Title>
                            <div>Questions added: <strong>{questions.length}</strong></div>
                            <div className="small text-muted">Current draft #: {draft.question_no}</div>
                            <div className="mt-2">
                                <Button variant="outline-secondary" size="sm" onClick={() => { setQuestions([]); setDraft(makeEmptyDraft(1)) }}>Clear All</Button>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

            </Row>
        </div>
    )
}
