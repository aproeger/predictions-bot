import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js'

export function buildCommands() {
  const predictionCommand = new SlashCommandBuilder()
    .setName('prediction')
    .setDescription('Prediction commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Adds a new bout for which users can make predictions.')
        .addStringOption((opt) =>
          opt.setName('fighter_a').setDescription('First fighter of the bout.').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('fighter_b').setDescription('Second fighter of the bout.').setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('event_name')
            .setDescription('Event in which the bout takes place.')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('event_date').setDescription('Date of the event.').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('image_url').setDescription('Event image URL.').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('lock')
        .setDescription('Locks the prediction, no more votes can be placed.')
        .addIntegerOption((opt) =>
          opt
            .setName('prediction_id')
            .setDescription('ID of the prediction to be locked.')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('Ends the prediction and reveals the winners.')
        .addIntegerOption((opt) =>
          opt
            .setName('prediction_id')
            .setDescription('ID of the prediction to be ended.')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('winner')
            .setDescription('The winner of the bout.')
            .setRequired(true)
            .addChoices(
              { name: 'Fighter A', value: 'a' },
              { name: 'Fighter B', value: 'b' },
              { name: 'Draw / No Contest', value: 'none' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('method')
            .setDescription('The win method of the bout.')
            .setRequired(true)
            .addChoices(
              { name: 'KO / TKO', value: 'ko' },
              { name: 'Decision', value: 'dec' },
              { name: 'Draw / No Contest', value: 'draw' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Deletes the prediction and all votes placed for it.')
        .addIntegerOption((opt) =>
          opt
            .setName('prediction_id')
            .setDescription('ID of the prediction to be deleted.')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('force')
            .setDescription('Force deletion if the prediction has already ended ("y" for yes).')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('active').setDescription('Show all active predictions and their votes.'),
    )

  const leaderboardCommand = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Shows the top 10 predictors.')
    .addStringOption((opt) =>
      opt
        .setName('sort')
        .setDescription('Ranking order (default: Fair Rating).')
        .setRequired(false)
        .addChoices(
          { name: 'Fair Rating', value: 'rating' },
          { name: 'Total Points', value: 'points' },
        ),
    )

  const pointsCommand = new SlashCommandBuilder()
    .setName('points')
    .setDescription('Shows your current points.')

  return [predictionCommand, leaderboardCommand, pointsCommand].map((c) => c.toJSON())
}

export async function registerCommands(
  applicationId: string,
  token: string,
  guildIds: string[],
) {
  const rest = new REST({ version: '10' }).setToken(token)
  const body = buildCommands()

  if (guildIds.length > 0) {
    for (const guildId of guildIds) {
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body })
      console.log(`Registered slash commands for guild ${guildId}.`)
    }
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body })
    console.log('Registered global slash commands.')
  }
}
