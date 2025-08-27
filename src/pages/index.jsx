import { useEffect, useState, useCallback } from 'react'
import { Row, Col, Badge, Spinner, Pagination } from 'react-bootstrap'
import api from '../api/axios'
import QuizCard from '../components/QuizCard'

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

export default function HomePage() {
    const [categories, setCategories] = useState([])
    const [quizzes, setQuizzes] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // store selected category as the category NAME (string) because backend expects /?categories=<name>
    const [selectedCategory, setSelectedCategory] = useState(null)

    // pagination state returned from backend meta
    const [page, setPage] = useState(1)
    const [lastPage, setLastPage] = useState(1)
    const [total, setTotal] = useState(0)

    const loadCategories = useCallback(async (signal) => {
        const res = await api.get('/categories/', { signal })
        return res.data || []
    }, [])

    // fetch quiz page (with optional category name filter)
    const loadQuizPage = useCallback(async (pageNum = 1, categoryName = null, signal) => {
        // Only include page param when page > 1 so backend can accept requests like ?categories=Cloud%20Computing
        const params = {}
        if (pageNum > 1) params.page = pageNum
        if (categoryName) params.categories = categoryName
        const res = await api.get('/quizinfo/', { params, signal })
        return res.data
    }, [])

    // load categories once
    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()
        async function init() {
            setLoading(true)
            setError(null)
            try {
                const cats = await loadCategories(controller.signal)
                if (!cancelled) setCategories(cats)
            } catch (err) {
                if (!cancelled) setError(err.response?.data || err.message || 'Failed to load categories')
            } finally {
                // let quiz fetch handle end of loading
            }
        }
        init()
        return () => { cancelled = true; controller.abort() }
    }, [loadCategories])

    // fetch quizzes whenever page or selectedCategory changes
    useEffect(() => {
        let cancelled = false
        const controller = new AbortController()

        async function fetchPage() {
            setLoading(true)
            setError(null)
            try {
                const payload = await loadQuizPage(page, selectedCategory, controller.signal)
                if (cancelled) return
                setQuizzes(payload.data || [])
                setTotal(payload.meta?.total ?? 0)
                setLastPage(payload.meta?.last_page ?? 1)
            } catch (err) {
                if (!cancelled) setError(err.response?.data || err.message || 'Failed to load quizzes')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchPage()
        return () => { cancelled = true; controller.abort() }
    }, [page, selectedCategory, loadQuizPage])

    // when selectedCategory changes, reset to page 1
    useEffect(() => {
        setPage(1)
    }, [selectedCategory])

    const pages = buildPaginationPages(page, lastPage, 2)
    const onClickPage = (p) => {
        if (p === 'ellipsis') return
        if (p < 1 || p > lastPage) return
        setPage(p)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    const onPrev = () => { if (page > 1) setPage(page - 1) }
    const onNext = () => { if (page < lastPage) setPage(page + 1) }

    return (
        <div>
            <Row className="mb-3">
                <Col>
                    <h3>Browse quizzes</h3>
                    <div className="d-flex flex-row flex-wrap gap-2" style={{ overflowX: 'auto' }}>
                        <Badge
                            pill
                            bg={selectedCategory === null ? 'primary' : 'secondary'}
                            className="me-2"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedCategory(null)}
                        >
                            All
                        </Badge>

                        {categories.map(cat => (
                            <Badge
                                key={cat.id}
                                pill
                                bg={selectedCategory === cat.name ? 'primary' : 'secondary'}
                                className="me-2"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedCategory(cat.name)}
                            >
                                {cat.name}
                            </Badge>
                        ))}
                    </div>
                </Col>
            </Row>

            <Row className="mb-2">
                <Col>
                    <div className="d-flex justify-content-between align-items-center">
                        <div className="small text-muted">
                            {loading ? 'Loading...' : `${total} quizzes — page ${page} of ${lastPage}`}
                        </div>
                    </div>
                </Col>
            </Row>

            {loading ? (
                <div style={{ minHeight: 200 }} className="d-flex align-items-center justify-content-center">
                    <Spinner animation="border" />
                </div>
            ) : error ? (
                <div className="text-danger">Error: {JSON.stringify(error)}</div>
            ) : quizzes.length === 0 ? (
                <div className="text-muted">No quizzes found.</div>
            ) : (
                <>
                    <Row className="g-3">
                        {quizzes.map(q => (
                            <Col key={q.id} xs={12}>
                                <QuizCard quiz={q} />
                            </Col>
                        ))}
                    </Row>

                    <Row className="mt-4">
                        <Col className="d-flex justify-content-center">
                            <Pagination>
                                <Pagination.First onClick={() => setPage(1)} disabled={page === 1} />
                                <Pagination.Prev onClick={onPrev} disabled={page === 1} />

                                {pages.map((p, idx) => {
                                    if (p === 'ellipsis') return <Pagination.Ellipsis key={`e-${idx}`} disabled />
                                    return (
                                        <Pagination.Item key={p} active={p === page} onClick={() => onClickPage(p)}>
                                            {p}
                                        </Pagination.Item>
                                    )
                                })}

                                <Pagination.Next onClick={onNext} disabled={page === lastPage} />
                                <Pagination.Last onClick={() => setPage(lastPage)} disabled={page === lastPage} />
                            </Pagination>
                        </Col>
                    </Row>
                </>
            )}
        </div>
    )
}
