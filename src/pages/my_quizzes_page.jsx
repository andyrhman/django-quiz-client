import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Row, Col, Card, Button, Spinner, Pagination, Modal } from 'react-bootstrap'
import api from '../api/axios'
import QuizCard from '../components/QuizCard' // reuse the horizontal card visually

// same pagination builder used across pages
function buildPaginationPages(current, last, siblings = 2) {
    if (last <= 1) return [1]
    const pages = new Set()
    pages.add(1)
    if (last >= 2) pages.add(2)
    const start = Math.max(1, current - siblings)
    const end = Math.min(last, current + siblings)
    for (let p = start; p <= end; p++) pages.add(p)
    if (last - 1 > 2) pages.add(last - 1)
    if (last > 1) pages.add(last)
    const arr = Array.from(pages).sort((a, b) => a - b)
    const out = []
    for (let i = 0; i < arr.length; i++) {
        const cur = arr[i]
        const prev = arr[i - 1]
        if (i > 0 && cur - prev > 1) out.push('ellipsis')
        out.push(cur)
    }
    return out
}

export default function MyQuizzesPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()

    // data state
    const [quizzes, setQuizzes] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // pagination state
    const [page, setPage] = useState(Number(searchParams.get('page')) || 1)
    const [lastPage, setLastPage] = useState(1)
    const [total, setTotal] = useState(0)

    // delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [deletingId, setDeletingId] = useState(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState(null)

    // fetch owner quizzes (paginated)
    const loadPage = useCallback(async (pageNum = 1, signal) => {
        // include page param only when >1 (backend might accept empty page)
        const params = {}
        if (pageNum > 1) params.page = pageNum
        const res = await api.get('/quizinfos/owner/', { params, signal })
        return res.data
    }, [])

    useEffect(() => {
        // when URL param changes, sync to local page
        const urlPage = Number(searchParams.get('page')) || 1
        setPage(prev => (prev !== urlPage ? urlPage : prev))
    }, [searchParams])

    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

        async function fetchPage() {
            setLoading(true)
            setError(null)
            try {
                const payload = await loadPage(page, controller.signal)
                if (cancelled) return
                setQuizzes(payload.data || [])
                setTotal(payload.meta?.total ?? 0)
                setLastPage(payload.meta?.last_page ?? 1)
            } catch (err) {
                if (!cancelled) setError(err.response?.data || err.message || 'Failed to load')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchPage()
        return () => { cancelled = true; controller.abort() }
    }, [page, loadPage])

    // update URL when page changes
    useEffect(() => {
        const params = {}
        if (page > 1) params.page = page
        setSearchParams(params, { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page])

    // pagination UI helpers
    const pages = buildPaginationPages(page, lastPage, 2)
    const goToPage = (p) => {
        if (p === 'ellipsis') return
        if (p < 1 || p > lastPage) return
        setPage(p)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    const prev = () => { if (page > 1) setPage(page - 1) }
    const next = () => { if (page < lastPage) setPage(page + 1) }

    // delete flow
    const confirmDelete = (id) => {
        setDeletingId(id)
        setDeleteError(null)
        setShowDeleteModal(true)
    }

    const doDelete = async () => {
        if (!deletingId) return
        setDeleting(true)
        setDeleteError(null)
        try {
            // call backend delete endpoint — adjust path if your API uses different path
            await api.delete(`/quizinfo/${deletingId}/`)
            setShowDeleteModal(false)
            setDeletingId(null)
            // refetch current page after deletion
            // if current page becomes empty and page > 1, go to previous page
            // simple approach: refetch page (server may return empty)
            const controller = new AbortController()
            const payload = await loadPage(page, controller.signal)
            setQuizzes(payload.data || [])
            setTotal(payload.meta?.total ?? 0)
            setLastPage(payload.meta?.last_page ?? 1)
            // if after deletion no items and we are past last page, navigate to lastPage
            if ((payload.data?.length ?? 0) === 0 && page > 1 && payload.meta?.last_page < page) {
                setPage(payload.meta?.last_page || 1)
            }
        } catch (err) {
            setDeleteError(err.response?.data || err.message || 'Failed to delete')
        } finally {
            setDeleting(false)
        }
    }

    // Edit nav
    const onEdit = (quizId) => {
        navigate(`/my-quizzes/edit/${quizId}`)
    }

    return (
        <div>
            <Row className="mb-3">
                <Col>
                    <h3>My Quizzes</h3>
                    <div className="small text-muted">{loading ? 'Loading...' : `${total} quizzes — page ${page} of ${lastPage}`}</div>
                </Col>
                <Col className="text-end">
                    <Button variant="primary" onClick={() => navigate('/create')}>Create Quiz</Button>
                </Col>
            </Row>

            {loading ? (
                <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 200 }}>
                    <Spinner animation="border" />
                </div>
            ) : error ? (
                <div className="text-danger">Error: {JSON.stringify(error)}</div>
            ) : quizzes.length === 0 ? (
                <div className="text-muted">You haven't created any quizzes yet.</div>
            ) : (
                <>
                    <Row className="g-3">
                        {quizzes.map(q => (
                            <Col key={q.id} xs={12}>
                                <Card className="shadow-sm">
                                    <Card.Body>
                                        <Row>
                                            <Col md={8}>
                                                <h5 className="mb-1">{q.name}</h5>
                                                <div className="mb-2 text-muted small">
                                                    <span className="me-3"><strong>Category:</strong> {q.category?.name || '-'}</span>
                                                    <span className="me-3"><strong>Max score:</strong> {q.max_score ?? '-'}</span>
                                                </div>
                                                <div className="text-muted small">
                                                    <span><strong>Created:</strong> {new Date(q.created_at).toLocaleString()}</span>
                                                </div>
                                            </Col>

                                            <Col md={4} className="d-flex flex-column justify-content-between align-items-end">
                                                <div className="text-end">
                                                    <div className="mb-2 small text-muted">{Math.floor((q.time_limit || 0) / 60)}m</div>
                                                </div>

                                                <div className="d-flex gap-2">
                                                    <Button variant="outline-primary" size="sm" onClick={() => onEdit(q.id)}>Edit</Button>
                                                    <Button variant="outline-danger" size="sm" onClick={() => confirmDelete(q.id)}>Delete</Button>
                                                </div>
                                            </Col>
                                        </Row>
                                    </Card.Body>
                                </Card>
                            </Col>
                        ))}
                    </Row>

                    <Row className="mt-4">
                        <Col className="d-flex justify-content-center">
                            <Pagination>
                                <Pagination.First onClick={() => setPage(1)} disabled={page === 1} />
                                <Pagination.Prev onClick={prev} disabled={page === 1} />

                                {pages.map((p, idx) => {
                                    if (p === 'ellipsis') return <Pagination.Ellipsis key={`e-${idx}`} disabled />
                                    return (
                                        <Pagination.Item key={p} active={p === page} onClick={() => goToPage(p)}>{p}</Pagination.Item>
                                    )
                                })}

                                <Pagination.Next onClick={next} disabled={page === lastPage} />
                                <Pagination.Last onClick={() => setPage(lastPage)} disabled={page === lastPage} />
                            </Pagination>
                        </Col>
                    </Row>
                </>
            )}

            {/* Delete confirmation modal */}
            <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Delete quiz</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to delete this quiz? This action cannot be undone.
                    {deleteError && <div className="text-danger mt-2">{JSON.stringify(deleteError)}</div>}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</Button>
                    <Button variant="danger" onClick={doDelete} disabled={deleting}>
                        {deleting ? (<><Spinner size="sm" animation="border" /> Deleting...</>) : 'Delete'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    )
}
