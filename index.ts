#!/usr/bin/env bun

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

// Type definitions
interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

interface JiraFields {
  project?: { key: string };
  issuetype?: { name: string };
  summary?: string;
  description?: {
    type: string;
    version: number;
    content: Array<{
      type: string;
      content: Array<{
        type: string;
        text: string;
      }>;
    }>;
  };
  priority?: { name: string };
  assignee?: { emailAddress: string };
  status?: { name: string };
  reporter?: { displayName: string };
  created?: string;
  updated?: string;
}

interface JiraIssue {
  key: string;
  fields: JiraFields;
}

interface JiraTransition {
  id: string;
  name: string;
}

interface JiraRequestOptions extends RequestInit {
  headers: {
    Authorization: string;
    Accept: string;
    'Content-Type': string;
  };
}

// use this if you are facing issue in loading creds from .env file 
// Jira Configuration
// const JIRA_CONFIG: JiraConfig = {
//   baseUrl: 'https://username.atlassian.net',
//   email: 'your email',
//   apiToken: 'your api key '
// };

// Create authentication header
const authHeader = btoa(`${JIRA_CONFIG.email}:${JIRA_CONFIG.apiToken}`);

class JiraServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "jira-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private async makeJiraRequest(endpoint: string, method = 'GET', body: any = null) {
    const url = `${JIRA_CONFIG.baseUrl}/rest/api/3/${endpoint}`;
    
    const options: JiraRequestOptions = {
      method,
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to make Jira request: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "create_jira_issue",
            description: "Create a new Jira issue",
            inputSchema: {
              type: "object",
              properties: {
                projectKey: {
                  type: "string",
                  description: "The project key (e.g., 'PROJ')"
                },
                issueType: {
                  type: "string",
                  description: "Issue type (e.g., 'Bug', 'Task', 'Story')"
                },
                summary: {
                  type: "string",
                  description: "Brief summary/title of the issue"
                },
                description: {
                  type: "string",
                  description: "Detailed description of the issue"
                },
                priority: {
                  type: "string",
                  description: "Priority level (e.g., 'High', 'Medium', 'Low')",
                  default: "Medium"
                },
                assignee: {
                  type: "string",
                  description: "Email or username of assignee (optional)"
                },
                epicKey: {
                  type: "string",
                  description: "Key of the epic to link this issue to (e.g., 'PROJ-123'). Only works for Story, Task, and Bug issue types."
                },
                epicName: {
                  type: "string",
                  description: "Name of the epic (required only when creating an Epic issue type)"
                }
              },
              required: ["projectKey", "issueType", "summary"]
            }
          },
          {
            name: "get_jira_issue",
            description: "Get details of a Jira issue",
            inputSchema: {
              type: "object",
              properties: {
                issueKey: {
                  type: "string",
                  description: "The issue key (e.g., 'PROJ-123')"
                }
              },
              required: ["issueKey"]
            }
          },
          {
            name: "search_jira_issues",
            description: "Search for Jira issues using JQL",
            inputSchema: {
              type: "object",
              properties: {
                jql: {
                  type: "string",
                  description: "JQL query string (e.g., 'project = PROJ AND status = Open')"
                },
                maxResults: {
                  type: "number",
                  description: "Maximum number of results to return",
                  default: 20
                }
              },
              required: ["jql"]
            }
          },
          {
            name: "get_jira_projects",
            description: "Get list of available Jira projects",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "update_jira_issue",
            description: "Update an existing Jira issue",
            inputSchema: {
              type: "object",
              properties: {
                issueKey: {
                  type: "string",
                  description: "The issue key (e.g., 'PROJ-123')"
                },
                summary: {
                  type: "string",
                  description: "New summary/title"
                },
                description: {
                  type: "string",
                  description: "New description"
                },
                priority: {
                  type: "string",
                  description: "New priority level"
                },
                assignee: {
                  type: "string",
                  description: "New assignee email or username"
                },
                epicKey: {
                  type: "string",
                  description: "Key of the epic to link this issue to (e.g., 'PROJ-123')"
                },
                status: {
                  type: "string",
                  description: "New status to transition to (e.g., 'To Do', 'In Progress', 'Done')"
                }
              },
              required: ["issueKey"]
            }
          },
          {
            name: "add_jira_comment",
            description: "Add a comment to a Jira issue",
            inputSchema: {
              type: "object",
              properties: {
                issueKey: {
                  type: "string",
                  description: "The issue key (e.g., 'PROJ-123')"
                },
                comment: {
                  type: "string",
                  description: "Comment text"
                }
              },
              required: ["issueKey", "comment"]
            }
          },
          {
            name: "transition_jira_issue",
            description: "Transition a Jira issue to a new status",
            inputSchema: {
              type: "object",
              properties: {
                issueKey: {
                  type: "string",
                  description: "The issue key (e.g., 'PROJ-123')"
                },
                transitionName: {
                  type: "string",
                  description: "Name of the transition (e.g., 'In Progress', 'Done', 'Close Issue')"
                }
              },
              required: ["issueKey", "transitionName"]
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "create_jira_issue":
            return await this.createIssue(args as { projectKey: string; issueType: string; summary: string; description?: string; priority?: string; assignee?: string; epicKey?: string; epicName?: string });
          case "get_jira_issue":
            return await this.getIssue(args as { issueKey: string });
          case "search_jira_issues":
            return await this.searchIssues(args as { jql: string; maxResults?: number });
          case "get_jira_projects":
            return await this.getProjects();
          case "update_jira_issue":
            return await this.updateIssue(args as { issueKey: string; summary?: string; description?: string; priority?: string; assignee?: string; epicKey?: string; status?: string });
          case "add_jira_comment":
            return await this.addComment(args as { issueKey: string; comment: string });
          case "transition_jira_issue":
            return await this.transitionIssue(args as { issueKey: string; transitionName: string });
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  async createIssue(args: { 
    projectKey: string; 
    issueType: string; 
    summary: string; 
    description?: string; 
    priority?: string; 
    assignee?: string;
    epicKey?: string;
    epicName?: string;
  }) {
    const { projectKey, issueType, summary, description, priority, assignee, epicKey, epicName } = args;

    const issueData: { fields: JiraFields } = {
      fields: {
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary: summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: description || ""
                }
              ]
            }
          ]
        }
      }
    };

    if (priority) {
      issueData.fields.priority = { name: priority };
    }

    if (assignee) {
      issueData.fields.assignee = { emailAddress: assignee };
    }

    // Handle epic-specific fields
    if (issueType.toLowerCase() === 'epic' && epicName) {
      // Add the epic name field - this is usually a custom field in Jira
      issueData.fields['customfield_10011'] = epicName; // Epic Name field
    }

    // Create the issue
    const result = await this.makeJiraRequest('issue', 'POST', issueData);

    // If this is not an epic and an epicKey is provided, link it to the epic
    if (epicKey && issueType.toLowerCase() !== 'epic') {
      try {
        // Add the epic link - this is usually a custom field in Jira
        await this.makeJiraRequest(`issue/${result.key}`, 'PUT', {
          fields: {
            'customfield_10014': epicKey // Epic Link field
          }
        });
      } catch (error) {
        console.error(`Warning: Issue created but failed to link to epic: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully created Jira issue!\n\n` +
                `Issue Key: ${result.key}\n` +
                `Issue URL: ${JIRA_CONFIG.baseUrl}/browse/${result.key}\n` +
                (epicKey ? `Linked to Epic: ${epicKey}` : '')
        }
      ]
    };
  }

  async getIssue(args) {
    const { issueKey } = args;
    const issue = await this.makeJiraRequest(`issue/${issueKey}`);
    
    const fields = issue.fields;
    const issueInfo = {
      key: issue.key,
      summary: fields.summary,
      description: fields.description?.content?.[0]?.content?.[0]?.text || 'No description',
      status: fields.status.name,
      priority: fields.priority?.name || 'None',
      assignee: fields.assignee?.displayName || 'Unassigned',
      reporter: fields.reporter?.displayName || 'Unknown',
      created: fields.created,
      updated: fields.updated
    };

    return {
      content: [
        {
          type: "text",
          text: `📋 **${issueInfo.key}**: ${issueInfo.summary}\n\n` +
                `**Status**: ${issueInfo.status}\n` +
                `**Priority**: ${issueInfo.priority}\n` +
                `**Assignee**: ${issueInfo.assignee}\n` +
                `**Reporter**: ${issueInfo.reporter}\n` +
                `**Created**: ${new Date(issueInfo.created).toLocaleDateString()}\n` +
                `**Updated**: ${new Date(issueInfo.updated).toLocaleDateString()}\n\n` +
                `**Description**: ${issueInfo.description}\n\n` +
                `**URL**: ${JIRA_CONFIG.baseUrl}/browse/${issueInfo.key}`
        }
      ]
    };
  }

  async searchIssues(args) {
    const { jql, maxResults = 20 } = args;
    const result = await this.makeJiraRequest(`search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`);
    
    if (result.issues.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No issues found matching the search criteria."
          }
        ]
      };
    }

    const issuesList = result.issues.map(issue => {
      const fields = issue.fields;
      return `• **${issue.key}**: ${fields.summary}\n  Status: ${fields.status.name} | Priority: ${fields.priority?.name || 'None'} | Assignee: ${fields.assignee?.displayName || 'Unassigned'}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: "text",
          text: `🔍 Found ${result.issues.length} issue(s):\n\n${issuesList}`
        }
      ]
    };
  }

  async getProjects() {
    const projects = await this.makeJiraRequest('project');
    
    const projectsList = projects.map(project => 
      `• **${project.key}**: ${project.name}`
    ).join('\n');

    return {
      content: [
        {
          type: "text",
          text: `📁 Available Projects:\n\n${projectsList}`
        }
      ]
    };
  }

  async updateIssue(args: { 
    issueKey: string; 
    summary?: string; 
    description?: string; 
    priority?: string; 
    assignee?: string;
    epicKey?: string;
    status?: string;
  }) {
    const { issueKey, summary, description, priority, assignee, epicKey, status } = args;
    
    // First, update the basic fields
    const updateData: { fields: JiraFields & { [key: string]: any } } = { fields: {} };
    
    if (summary) updateData.fields.summary = summary;
    if (description) {
      updateData.fields.description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: description
              }
            ]
          }
        ]
      };
    }
    if (priority) updateData.fields.priority = { name: priority };
    if (assignee) updateData.fields.assignee = { emailAddress: assignee };

    // Update epic link if provided
    if (epicKey !== undefined) {
      // If epicKey is null or empty string, it will remove the epic link
      updateData.fields['customfield_10014'] = epicKey || null;
    }

    // Update the issue fields
    await this.makeJiraRequest(`issue/${issueKey}`, 'PUT', updateData);

    let statusUpdateMessage = '';
    // Handle status transition if requested
    if (status) {
      try {
        // Get available transitions
        const transitions = await this.makeJiraRequest(`issue/${issueKey}/transitions`);
        
        // Find the requested transition
        const transition = transitions.transitions.find((t: JiraTransition) => 
          t.name.toLowerCase() === status.toLowerCase()
        );
        
        if (transition) {
          // Execute the transition
          await this.makeJiraRequest(`issue/${issueKey}/transitions`, 'POST', {
            transition: { id: transition.id }
          });
          statusUpdateMessage = `\nStatus updated to: ${transition.name}`;
        } else {
          const availableTransitions = transitions.transitions
            .map((t: JiraTransition) => t.name)
            .join(', ');
          statusUpdateMessage = `\nWarning: Could not transition to "${status}". Available transitions: ${availableTransitions}`;
        }
      } catch (error) {
        statusUpdateMessage = `\nWarning: Failed to update status: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    
    // Get the updated issue to confirm changes
    const updatedIssue = await this.makeJiraRequest(`issue/${issueKey}`);
    const currentStatus = updatedIssue.fields.status.name;
    const currentEpic = updatedIssue.fields.customfield_10014 || 'None';
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully updated issue ${issueKey}\n\n` +
                `Current Status: ${currentStatus}${statusUpdateMessage}\n` +
                `Epic Link: ${currentEpic === 'None' ? 'Not linked to any epic' : currentEpic}\n\n` +
                `Issue URL: ${JIRA_CONFIG.baseUrl}/browse/${issueKey}`
        }
      ]
    };
  }

  async addComment(args: { issueKey: string; comment: string }) {
    const { issueKey, comment } = args;
    
    const commentData = {
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: comment
              }
            ]
          }
        ]
      }
    };

    await this.makeJiraRequest(`issue/${issueKey}/comment`, 'POST', commentData);
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully added comment to issue ${issueKey}\n\nIssue URL: ${JIRA_CONFIG.baseUrl}/browse/${issueKey}`
        }
      ]
    };
  }

  async transitionIssue(args: { issueKey: string; transitionName: string }) {
    const { issueKey, transitionName } = args;
    
    // Get available transitions for the issue
    const transitions = await this.makeJiraRequest(`issue/${issueKey}/transitions`);
    
    // Find the transition by name
    const transition = transitions.transitions.find((t: JiraTransition) => 
      t.name.toLowerCase() === transitionName.toLowerCase()
    );
    
    if (!transition) {
      const availableTransitions = transitions.transitions.map((t: JiraTransition) => t.name).join(', ');
      throw new McpError(
        ErrorCode.InvalidParams,
        `Transition '${transitionName}' not found. Available transitions: ${availableTransitions}`
      );
    }

    // Execute the transition
    const transitionData = {
      transition: {
        id: transition.id
      }
    };

    await this.makeJiraRequest(`issue/${issueKey}/transitions`, 'POST', transitionData);
    
    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully transitioned issue ${issueKey} to '${transition.name}'\n\nIssue URL: ${JIRA_CONFIG.baseUrl}/browse/${issueKey}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.info("Jira MCP server running on stdio");
  }
}

const server = new JiraServer();

server.run().catch(console.error);
