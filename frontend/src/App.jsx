import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_BASE_URL = '/api'
const SESSION_STORAGE_KEY = 'chatbot_session_id'
const ARCHIVE_STORAGE_KEY = 'chatbot_archived_chats'
const INITIAL_MESSAGES = [
  {
    role: 'assistant',
    content: 'Hi! How can I help you today?',
  },
]

const createArchiveId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const getChatArchiveId = (chat, index) => chat.archiveId || `${chat.sessionId || 'chat'}-${index}`

function App() {
  const [sessionId, setSessionId] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [archivedChats, setArchivedChats] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPreviousChats, setShowPreviousChats] = useState(false)
  const [openMenuKey, setOpenMenuKey] = useState('')
  const errorTimerRef = useRef(null)

  const showTemporaryError = (message) => {
    setError(message)
    if (errorTimerRef.current) {
      window.clearTimeout(errorTimerRef.current)
    }
    errorTimerRef.current = window.setTimeout(() => {
      setError('')
      errorTimerRef.current = null
    }, 5000)
  }

  const canSend = !isLoading

  useEffect(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)

    const archived = JSON.parse(window.localStorage.getItem(ARCHIVE_STORAGE_KEY) || '[]')
    const normalizedArchived = archived.map((chat) => ({
      ...chat,
      archiveId: chat.archiveId || createArchiveId(),
    }))
    setArchivedChats(normalizedArchived)
    window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(normalizedArchived))
  }, [])

  useEffect(
    () => () => {
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!sessionId) return

    async function loadHistory() {
      try {
        const response = await fetch(`${API_BASE_URL}/history?session_id=${sessionId}`)
        if (!response.ok) throw new Error(`Failed to load history: ${response.status}`)
        const data = await response.json()
        setMessages(data.history || [])
      } catch (historyError) {
        setError(historyError.message || 'Unable to load history.')
      }
    }

    loadHistory()
  }, [sessionId])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSend) return
    const currentMessage = input.trim()
    if (!currentMessage) {
      showTemporaryError('Write something')
      return
    }

    setIsLoading(true)
    setError('')
    setInput('')

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentMessage,
          session_id: sessionId || null,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Request failed.')
      }

      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id)
      }

      setMessages(data.history || [])
    } catch (requestError) {
      setError(requestError.message || 'Unable to send message.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearChat = () => {
    if (sessionId) {
      const updatedChats = archivedChats.filter((chat) => chat.sessionId !== sessionId)
      setArchivedChats(updatedChats)
      window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(updatedChats))
      setOpenMenuKey('')
    }

    setMessages(INITIAL_MESSAGES)
    setInput('')
    setError('')
    setSessionId('')
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  }

  const handleShowArchivedChat = (chat) => {
    setMessages(chat.messages || [])
    setSessionId(chat.sessionId || '')
    setInput('')
    setError('')
    if (chat.sessionId) {
      setOpenMenuKey('')
    }
  }

  const saveArchivedChats = (updatedChats) => {
    setArchivedChats(updatedChats)
    window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(updatedChats))
  }

  const upsertArchivedChat = (nextSessionId, nextMessages) => {
    if (!nextSessionId || !Array.isArray(nextMessages) || nextMessages.length === 0) return

    const updatedChats = [...archivedChats]
    const existingIndex = updatedChats.findIndex((chat) => chat.sessionId === nextSessionId)

    if (existingIndex === -1) {
      updatedChats.unshift({
        archiveId: createArchiveId(),
        sessionId: nextSessionId,
        messages: nextMessages,
        savedAt: new Date().toISOString(),
      })
    } else {
      updatedChats[existingIndex] = {
        ...updatedChats[existingIndex],
        messages: nextMessages,
        savedAt: new Date().toISOString(),
      }
    }

    saveArchivedChats(updatedChats)
  }

  useEffect(() => {
    upsertArchivedChat(sessionId, messages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messages])

  useEffect(() => {
    if (!openMenuKey) return undefined

    const closeMenuOnOutsideClick = (event) => {
      if (event.target.closest('.chat-menu-wrapper')) return
      setOpenMenuKey('')
    }

    document.addEventListener('mousedown', closeMenuOnOutsideClick)

    return () => {
      document.removeEventListener('mousedown', closeMenuOnOutsideClick)
    }
  }, [openMenuKey])

  const handleRenameArchivedChat = (chatKey) => {
    const chat = archivedChats.find((item, index) => getChatArchiveId(item, index) === chatKey)
    if (!chat) return

    const currentTitle =
      chat.title || `Chat - ${new Date(chat.savedAt || chat.clearedAt).toLocaleString()}`
    const nextTitle = window.prompt('Rename chat', currentTitle)
    if (!nextTitle || !nextTitle.trim()) return

    const updatedChats = archivedChats.map((item, index) => {
      const key = getChatArchiveId(item, index)
      if (key !== chatKey) return item
      return {
        ...item,
        title: nextTitle.trim(),
      }
    })

    saveArchivedChats(updatedChats)
    setOpenMenuKey('')
  }

  const handleDeleteArchivedChat = (chatKey) => {
    const deletedChat = archivedChats.find(
      (item, index) => getChatArchiveId(item, index) === chatKey,
    )
    const updatedChats = archivedChats.filter((item, index) => getChatArchiveId(item, index) !== chatKey)
    saveArchivedChats(updatedChats)

    if (deletedChat?.sessionId && deletedChat.sessionId === sessionId) {
      setMessages(INITIAL_MESSAGES)
      setInput('')
      setError('')
      setSessionId('')
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    }

    setOpenMenuKey('')
  }

  const handleNewChat = () => {
    setMessages(INITIAL_MESSAGES)
    setInput('')
    setError('')
    setSessionId('')
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  }

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div className="brand-block">
          <h1>AI Chatbot</h1>
          <p>Your smart assistant for quick answers</p>
        </div>
        <div className="chat-actions">
          <button type="button" className="new-chat-btn" onClick={handleNewChat}>
            New Chat
          </button>
          <button
            type="button"
            className="previous-chat-btn"
            onClick={() => setShowPreviousChats((prev) => !prev)}
          >
            Previous Chats
          </button>
          <button type="button" className="clear-chat-btn" onClick={handleClearChat}>
            Clear Chat
          </button>
        </div>
      </header>

      <section className="messages" aria-live="polite">
        <div className="messages-top">
          <span className="online-dot"></span>
          <span>Assistant is ready</span>
        </div>
        {messages.length === 0 && <p className="empty">Start chatting to see messages here.</p>}
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
            <strong>{message.role === 'user' ? 'You' : 'AI'}</strong>
            <p>{message.content}</p>
          </article>
        ))}
      </section>

      <p className={`error ${error ? 'error-visible' : 'error-hidden'}`}>{error}</p>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            if (error) setError('')
          }}
          disabled={isLoading}
        />
        <button type="submit" disabled={!canSend}>
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>

      {showPreviousChats && (
        <section className="previous-chats">
          <h2>Previous Chats</h2>
          {archivedChats.length === 0 && <p className="empty">No previous chats yet.</p>}
          {archivedChats.map((chat, index) => {
            const chatKey = getChatArchiveId(chat, index)

            return (
            <div key={chatKey} className="previous-chat-row">
              <button
                type="button"
                className="previous-chat-item"
                onClick={() => handleShowArchivedChat(chat)}
              >
                {chat.title ||
                  `Chat ${archivedChats.length - index} - ${new Date(chat.savedAt || chat.clearedAt).toLocaleString()}`}
              </button>
              <div className="chat-menu-wrapper">
                <button
                  type="button"
                  className="chat-menu-btn"
                  aria-label="Chat options"
                  aria-expanded={openMenuKey === chatKey}
                  onClick={() =>
                    setOpenMenuKey((prev) => (prev === chatKey ? '' : chatKey))
                  }
                >
                  ...
                </button>
                {openMenuKey === chatKey && (
                  <div className="chat-menu">
                    <button
                      type="button"
                      onClick={() => handleRenameArchivedChat(chatKey)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteArchivedChat(chatKey)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
            )
          })}
        </section>
      )}
    </main>
  )
}

export default App
