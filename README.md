# Jira Automation

MCP server to handle Jira-related tasks from IDE.

## Setup

1. Clone the repository:
```bash
git clone https://github.com/AdityaRajPateriya/JiraAutomation.git
cd JiraAutomation
```

2. Create a `.env` file in the root directory with the following variables:
```bash
JIRA_BASE_URL=your_jira_url
JIRA_EMAIL=your_email
JIRA_API_TOKEN=your_api_token
```

Replace the values with your actual Jira credentials:
- `JIRA_BASE_URL`: Your Atlassian domain (e.g., https://your-domain.atlassian.net)
- `JIRA_EMAIL`: Your Atlassian account email
- `JIRA_API_TOKEN`: Your Atlassian API token (Generate one from https://id.atlassian.com/manage-profile/security/api-tokens)

3. Install dependencies:
```bash
npm install
```

4. Start the server:
```bash
npm start
```

## Security Note

Never commit your `.env` file or expose your API tokens in the code. The `.env` file is included in `.gitignore` to prevent accidental commits of sensitive information.

## Features

- Written in TypeScript with full type safety
- Powered by Bun for maximum performance
- Secure credential management using environment variables
- Basic Jira connection setup
- Fetch issues assigned to the current user
- Create new issues
- Object-oriented design with clean separation of concerns

## Project Structure

```
├── src/
│   ├── index.ts        # Main application file
│   └── types.ts        # TypeScript interfaces
├── .env.example        # Example environment variables
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md          # This file
```

## Next Steps

Future enhancements may include:
- Updating issue status
- Adding comments
- Creating and managing projects
- Handling attachments
- Custom JQL queries
- Error handling improvements
- Unit tests using Bun's test runner
- GitHub Actions integration
