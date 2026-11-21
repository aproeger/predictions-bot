export interface VoteStats {
  votes_a: number
  votes_b: number
  votes_draw: number
  total_votes: number
  votes_a_percent: number
  votes_b_percent: number
  votes_draw_percent: number
}

export interface PredictionDoc {
  id: number | string
  status: 'active' | 'locked' | 'ended'
  fighter_a: string
  fighter_b: string
  event_name: string
  event_date: string
  image_url?: string | null
  winner?: 'a' | 'b' | 'none' | null
  method?: 'ko' | 'dec' | 'draw' | null
  discord_message_id?: string | null
  discord_channel_id?: string | null
  stats?: VoteStats
  my_vote?: { fighter: 'a' | 'b' | null; method: 'ko' | 'dec' | 'draw' } | null
}

export interface SettlementResult {
  exactWinners: Array<{
    discord_id: string
    username?: string | null
    display_name?: string | null
    wins: number
  }>
  winners: Array<{
    discord_id: string
    username?: string | null
    display_name?: string | null
    wins: number
  }>
  totalParticipants: number
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export class ApiClient {
  private baseUrl: string

  constructor(
    baseUrl: string,
    private secret: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: Record<string, unknown>; params?: Record<string, string | undefined> } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (options.params) {
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined) url.searchParams.set(k, v)
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': this.secret,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const data = (await res.json().catch(() => ({}))) as any
    if (!res.ok) {
      throw new ApiError(res.status, data?.error || `HTTP ${res.status}`)
    }
    return data as T
  }

  listPredictions(status?: string, discordId?: string) {
    return this.request<{ docs: PredictionDoc[] }>('GET', '/predictions-api/list', {
      params: { status, discord_id: discordId },
    })
  }

  getByMessage(discordMessageId: string) {
    return this.request<{ prediction: PredictionDoc }>('GET', '/predictions-api/bot/by-message', {
      params: { discord_message_id: discordMessageId },
    })
  }

  createPrediction(data: {
    fighter_a: string
    fighter_b: string
    event_name: string
    event_date: string
    image_url?: string
  }) {
    return this.request<{ prediction: PredictionDoc }>('POST', '/predictions-api/bot/create', {
      body: data,
    })
  }

  attachMessage(predictionId: number | string, discordMessageId: string, discordChannelId: string) {
    return this.request<{ ok: boolean }>('POST', '/predictions-api/bot/attach-message', {
      body: {
        prediction_id: predictionId,
        discord_message_id: discordMessageId,
        discord_channel_id: discordChannelId,
      },
    })
  }

  lockPrediction(predictionId: number | string) {
    return this.request<{ prediction: PredictionDoc }>('POST', '/predictions-api/bot/lock', {
      body: { prediction_id: predictionId },
    })
  }

  endPrediction(predictionId: number | string, winner: string, method: string) {
    return this.request<{ prediction: PredictionDoc; settlement: SettlementResult }>(
      'POST',
      '/predictions-api/bot/end',
      {
        body: { prediction_id: predictionId, winner, method },
      },
    )
  }

  deletePrediction(predictionId: number | string, force = false) {
    return this.request<{ ok: boolean; prediction: PredictionDoc }>(
      'POST',
      '/predictions-api/bot/delete',
      {
        body: { prediction_id: predictionId, force },
      },
    )
  }

  vote(data: {
    prediction_id: number | string
    discord_id: string
    username?: string
    display_name?: string
    avatar?: string | null
    fighter: 'a' | 'b' | null
    method: 'ko' | 'dec' | 'draw'
  }) {
    return this.request<{ ok: boolean; stats: VoteStats }>('POST', '/predictions-api/vote', {
      body: { ...data, source: 'discord' },
    })
  }

  getLeaderboard(limit = 10, discordId?: string) {
    return this.request<{
      leaderboard: Array<{
        rank: number
        discord_id: string
        username: string | null
        display_name?: string | null
        wins: number
        participations: number
      }>
    }>('GET', '/predictions-api/leaderboard', {
      params: { limit: String(limit), discord_id: discordId },
    })
  }

  getMe(discordId: string) {
    return this.request<{
      user: {
        discord_id: string
        username?: string | null
        display_name?: string | null
        wins: number
        participations: number
        rank: number | null
      }
    }>('GET', '/predictions-api/me', {
      params: { discord_id: discordId },
    })
  }
}
