
export const DISCORD_COMMANDS = {
    BINGAI_COMMAND: {
        name: 'bingai',
        description: 'Converse with BingAI',
        options: [
            {
                type: 3,
                name: 'query',
                description: 'What to say to BingAI',
                required: true,
            }
        ],
    },
    SYDNEY_COMMAND: {
        name: 'sydney',
        description: 'Converse with Sydney',
        options: [
            {
                type: 3,
                name: 'query',
                description: 'What to say to Sydney',
                required: true,
            }
        ],
    },
    CLEAR_COMMAND: {
        name: 'clear',
        description: 'Clears the stored context for the current chat',
    },
    INVITE_COMMAND: {
        name: 'invite',
        description: 'Get an invite link to add the bot to your server',
    },
}
