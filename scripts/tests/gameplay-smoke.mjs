const BACKEND_URL = process.env.TEST_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:5001'
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173'

const rows = []
let cookie = ''

function addRow(step, ok, detail) {
  rows.push({ step, status: ok ? 'PASS' : 'FAIL', detail })
}

async function requestJson(path, init = {}) {
  const headers = new Headers(init.headers || {})
  if (cookie) headers.set('cookie', cookie)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) {
    cookie = setCookie.split(';')[0]
  }

  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return { response, data }
}

function requireOk(response, data, label) {
  if (!response.ok) {
    throw new Error(`${label}: ${response.status} ${typeof data === 'object' && data ? data.error || JSON.stringify(data) : String(data)}`)
  }
}

async function runStep(step, fn) {
  try {
    const detail = await fn()
    addRow(step, true, detail)
  } catch (error) {
    addRow(step, false, error instanceof Error ? error.message : String(error))
  }
}

async function run() {
  const username = `smoke_${Date.now()}`
  const password = 'password123'
  const name = 'Smoke Hero'

  let selectedSet
  let questions = []

  await runStep('Frontend root', async () => {
    const response = await fetch(FRONTEND_URL)
    const html = await response.text()
    if (!response.ok || !html.includes('<div id="root">')) {
      throw new Error(`Frontend root failed: ${response.status}`)
    }
    return `status=${response.status}`
  })

  await runStep('Register', async () => {
    const { response, data } = await requestJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, name }),
    })
    requireOk(response, data, 'Register')
    return `userId=${data.userId}`
  })

  await runStep('Login', async () => {
    const { response, data } = await requestJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    requireOk(response, data, 'Login')
    return `userId=${data.userId}`
  })

  await runStep('Character select save', async () => {
    const { response, data } = await requestJson('/api/character', {
      method: 'POST',
      body: JSON.stringify({ classId: 'knight', name }),
    })
    requireOk(response, data, 'Create character')
    return `class=${data.classId}, name=${data.name}`
  })

  await runStep('Character fetch', async () => {
    const { response, data } = await requestJson('/api/character')
    requireOk(response, data, 'Get character')
    return `class=${data.classId}, level=${data.level}`
  })

  await runStep('Inventory fetch', async () => {
    const { response, data } = await requestJson('/api/inventory')
    requireOk(response, data, 'Get inventory')
    if (!Array.isArray(data.ownedWeaponIds) || !Array.isArray(data.potions)) {
      throw new Error('Inventory shape mismatch')
    }
    return `gold=${data.gold}, weapons=${data.ownedWeaponIds.length}, potions=${data.potions.length}`
  })

  await runStep('Quiz set list', async () => {
    const { response, data } = await requestJson('/api/question-sets?subject=reading&difficulty=Easy')
    requireOk(response, data, 'Get question sets')
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No reading question sets returned')
    }
    selectedSet = data[0]
    return `setId=${selectedSet.id}, title=${selectedSet.title}`
  })

  await runStep('Quiz question list', async () => {
    const { response, data } = await requestJson(`/api/questions?setId=${encodeURIComponent(selectedSet.id)}`)
    requireOk(response, data, 'Get questions')
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No questions returned')
    }
    questions = data
    return `questions=${questions.length}`
  })

  await runStep('Quiz submit', async () => {
    const answers = questions.map(() => 'A')
    const { response, data } = await requestJson('/api/submit', {
      method: 'POST',
      body: JSON.stringify({
        setId: selectedSet.id,
        subject: 'reading',
        answers,
      }),
    })
    requireOk(response, data, 'Submit answers')
    return `score=${data.score}, xp=${data.xpEarned}, gold=${data.goldEarned}`
  })

  await runStep('Shop buy potion', async () => {
    const { response, data } = await requestJson('/api/shop/buy-potion', {
      method: 'POST',
      body: JSON.stringify({ potionId: 'small_potion' }),
    })
    requireOk(response, data, 'Buy potion')
    return `gold=${data.gold}, potions=${JSON.stringify(data.potions)}`
  })

  await runStep('Shop buy weapon', async () => {
    const { response, data } = await requestJson('/api/shop/buy-weapon', {
      method: 'POST',
      body: JSON.stringify({ weaponId: 'iron_sword' }),
    })
    requireOk(response, data, 'Buy weapon')
    return `gold=${data.gold}, owned=${data.ownedWeaponIds.join(',')}`
  })

  await runStep('Inventory equip weapon', async () => {
    const { response, data } = await requestJson('/api/inventory/equip-weapon', {
      method: 'POST',
      body: JSON.stringify({ weaponId: 'iron_sword' }),
    })
    requireOk(response, data, 'Equip weapon')
    return `equipped=${data.equippedWeaponId}`
  })

  await runStep('Inventory use potion', async () => {
    const { response, data } = await requestJson('/api/inventory/use-potion', {
      method: 'POST',
      body: JSON.stringify({ potionId: 'small_potion' }),
    })
    requireOk(response, data, 'Use potion')
    return `healed=${data.healedAmount}, remaining=${JSON.stringify(data.inventory.potions)}`
  })

  await runStep('Dashboard stats', async () => {
    const { response, data } = await requestJson('/api/dashboard/stats')
    requireOk(response, data, 'Dashboard stats')
    return `level=${data.level}, xp=${data.totalXp}, gold=${data.totalGold}`
  })

  await runStep('Dashboard streak', async () => {
    const { response, data } = await requestJson('/api/dashboard/weekly-streak')
    requireOk(response, data, 'Dashboard streak')
    return `streakCount=${data.streakCount}`
  })

  await runStep('Dashboard wrong questions', async () => {
    const { response, data } = await requestJson('/api/dashboard/wrong-questions-review')
    requireOk(response, data, 'Dashboard wrong questions')
    return `entries=${Array.isArray(data.entries) ? data.entries.length : 0}`
  })

  await runStep('Dashboard live boss teaser', async () => {
    const { response, data } = await requestJson('/api/live-boss-teaser')
    requireOk(response, data, 'Live boss teaser')
    return `subject=${data.battleSubject}, difficulty=${data.difficulty}, boss=${data.bossName}`
  })

  console.log(JSON.stringify(rows, null, 2))
  const failed = rows.filter(row => row.status === 'FAIL')
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})