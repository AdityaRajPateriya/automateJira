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
  parent?: { key: string };
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

// Add new interface for Sprint
interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
  boardId: number;
}

// Add new interfaces for enhanced functionality
interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectId: number;
    displayName: string;
    projectName: string;
    projectKey: string;
    projectTypeKey: string;
    avatarURI: string;
    name: string;
  };
}

interface JiraSprintIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee?: { displayName: string };
  };
}

// Jira Configuration
const JIRA_CONFIG: JiraConfig = {
  baseUrl: process.env.JIRA_BASE_URL || '',
  email: process.env.JIRA_EMAIL || '',
  apiToken: process.env.JIRA_API_TOKEN || ''
};

if (!JIRA_CONFIG.baseUrl || !JIRA_CONFIG.email || !JIRA_CONFIG.apiToken) {
  throw new Error('Missing required environment variables. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN');
}

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
    const isAgileEndpoint = endpoint.startsWith('agile/');
    const baseEndpoint = isAgileEndpoint ? 'rest/agile/1.0/' : 'rest/api/3/';
    const url = `${JIRA_CONFIG.baseUrl}/${baseEndpoint}${endpoint.replace(/^agile\//, '')}`;
    
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
        let errorMessage = `Jira API error: ${response.status} ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorBody);
          errorMessage += ` - ${errorJson.errorMessages?.join(', ') || errorJson.message || errorBody}`;
        } catch {
          errorMessage += ` - ${errorBody}`;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
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
              properties: {
                random_string: {
                  type: "string",
                  description: "Dummy parameter for no-parameter tools"
                }
              },
              required: ["random_string"]
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
          },
          {
            name: "get_sprints",
            description: "Get list of sprints for a project",
            inputSchema: {
              type: "object",
              properties: {
                projectKey: {
                  type: "string",
                  description: "The project key (e.g., 'PROJ')"
                }
              },
              required: ["projectKey"]
            }
          },
          {
            name: "move_to_sprint",
            description: "Move an issue to a sprint",
            inputSchema: {
              type: "object",
              properties: {
                issueKey: {
                  type: "string",
                  description: "The issue key to move (e.g., 'PROJ-123')"
                },
                sprintId: {
                  type: "number",
                  description: "The ID of the sprint to move the issue to"
                }
              },
              required: ["issueKey", "sprintId"]
            }
          },
          {
            name: "get_sprint_issues",
            description: "Get list of issues in a sprint",
            inputSchema: {
              type: "object",
              properties: {
                sprintId: {
                  type: "number",
                  description: "The ID of the sprint"
                }
              },
              required: ["sprintId"]
            }
          },
          {
            name: "get_boards",
            description: "Get list of boards for a project",
            inputSchema: {
              type: "object",
              properties: {
                projectKey: {
                  type: "string",
                  description: "The project key (e.g., 'PROJ')"
                }
              },
              required: ["projectKey"]
            }
          },
          {
            name: "update_sprint",
            description: "Update sprint details",
            inputSchema: {
              type: "object",
              properties: {
                sprintId: {
                  type: "number",
                  description: "The ID of the sprint to update"
                },
                name: {
                  type: "string",
                  description: "New name for the sprint"
                },
                goal: {
                  type: "string",
                  description: "New goal for the sprint"
                },
                startDate: {
                  type: "string",
                  description: "New start date (ISO format)"
                },
                endDate: {
                  type: "string",
                  description: "New end date (ISO format)"
                }
              },
              required: ["sprintId"]
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (!args) {
        throw new McpError(ErrorCode.InternalError, "No arguments provided");
      }

      switch (name) {
        case "create_jira_issue":
          return await this.createIssue(args as { 
            projectKey: string; 
            issueType: string; 
            summary: string; 
            description?: string; 
            priority?: string; 
            assignee?: string;
            epicKey?: string;
            epicName?: string;
            parentIssueKey?: string;
          });
        case "get_jira_issue":
          return await this.getIssue(args as { issueKey: string });
        case "search_jira_issues":
          return await this.searchIssues(args as { jql: string; maxResults?: number });
        case "get_jira_projects":
          return await this.getProjects();
        case "update_jira_issue":
          return await this.updateIssue(args as { 
            issueKey: string; 
            summary?: string; 
            description?: string; 
            priority?: string; 
            assignee?: string;
            epicKey?: string;
            status?: string;
          });
        case "add_jira_comment":
          return await this.addComment(args as { issueKey: string; comment: string });
        case "transition_jira_issue":
          return await this.transitionIssue(args as { issueKey: string; transitionName: string });
        case "get_sprints":
          return await this.getSprints(args as { projectKey: string });
        case "move_to_sprint":
          return await this.moveIssueToSprint(args as { issueKey: string; sprintId: number });
        case "get_sprint_issues":
          return await this.getSprintIssues(args as { sprintId: number });
        case "get_boards":
          return await this.getBoards(args as { projectKey: string });
        case "update_sprint":
          return await this.updateSprintDetails(args as {
            sprintId: number;
            name?: string;
            goal?: string;
            startDate?: string;
            endDate?: string;
          });
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
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
    parentIssueKey?: string;
  }) {
    const { projectKey, issueType, summary, description, priority, assignee, epicKey, epicName, parentIssueKey } = args;

    // First, get the available issue types for the project
    const projectMetadata = await this.makeJiraRequest(`issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`);
    const project = projectMetadata.projects[0];
    if (!project) {
      throw new McpError(ErrorCode.InvalidParams, `Project ${projectKey} not found`);
    }

    // Find the correct issue type, trying different variations of the name
    const issueTypeVariations = [
      issueType,
      issueType.toLowerCase(),
      issueType.toUpperCase(),
      issueType.charAt(0).toUpperCase() + issueType.slice(1).toLowerCase()
    ];

    const matchedIssueType = project.issuetypes.find(type => 
      issueTypeVariations.includes(type.name) || 
      issueTypeVariations.includes(type.name.replace(/\s+/g, ''))
    );

    if (!matchedIssueType) {
      const availableTypes = project.issuetypes.map(type => type.name).join(', ');
      throw new McpError(ErrorCode.InvalidParams, 
        `Issue type '${issueType}' not found. Available types: ${availableTypes}`
      );
    }

    const issueData: { fields: JiraFields } = {
      fields: {
        project: { key: projectKey },
        issuetype: { name: matchedIssueType.name }, // Use the exact name from Jira
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
    if (matchedIssueType.name.toLowerCase() === 'epic' && epicName) {
      // Add the epic name field - this is usually a custom field in Jira
      issueData.fields['customfield_10011'] = epicName; // Epic Name field
    }

    // Add parent issue key if creating a subtask
    if (matchedIssueType.name.toLowerCase().includes('sub') && parentIssueKey) {
      issueData.fields.parent = { key: parentIssueKey };
    } else if (matchedIssueType.name.toLowerCase().includes('sub') && !parentIssueKey) {
      throw new Error('Parent issue key is required when creating a subtask');
    }

    // Create the issue
    const result = await this.makeJiraRequest('issue', 'POST', issueData);

    // If this is not an epic and an epicKey is provided, link it to the epic
    if (epicKey && !matchedIssueType.name.toLowerCase().includes('epic')) {
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
                `Issue Type: ${matchedIssueType.name}\n` +
                `Issue URL: ${JIRA_CONFIG.baseUrl}/browse/${result.key}\n` +
                (epicKey ? `Linked to Epic: ${epicKey}` : '') +
                (parentIssueKey ? `\nParent Issue: ${parentIssueKey}` : '')
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

  async getSprints(args: { projectKey: string }) {
    const { projectKey } = args;
    
    // First get all boards for the project
    const boardsResponse = await this.makeJiraRequest(`agile/board?projectKeyOrId=${projectKey}`);
    if (!boardsResponse.values || boardsResponse.values.length === 0) {
      throw new McpError(ErrorCode.InternalError, `No board found for project ${projectKey}`);
    }
    
    // Get sprints for all boards
    const allSprints: JiraSprint[] = [];
    for (const board of boardsResponse.values) {
      try {
        const sprintsResponse = await this.makeJiraRequest(`agile/board/${board.id}/sprint?state=active,future`);
        if (sprintsResponse.values) {
          allSprints.push(...sprintsResponse.values.map((sprint: JiraSprint) => ({
            ...sprint,
            boardId: board.id
          })));
        }
      } catch (error) {
        console.warn(`Warning: Failed to fetch sprints for board ${board.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (allSprints.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `ℹ️ No active or future sprints found for project ${projectKey}`
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `🏃‍♂️ Available Sprints:\n\n${allSprints.map(sprint => 
            `• **${sprint.name}** (${sprint.state})\n` +
            `  ID: ${sprint.id}\n` +
            `  Board ID: ${sprint.boardId}${
              sprint.startDate ? `\n  Start: ${new Date(sprint.startDate).toLocaleDateString()}` : ''
            }${
              sprint.endDate ? `\n  End: ${new Date(sprint.endDate).toLocaleDateString()}` : ''
            }${
              sprint.goal ? `\n  Goal: ${sprint.goal}` : ''
            }`
          ).join('\n\n')}`
        }
      ]
    };
  }

  async moveIssueToSprint(args: { issueKey: string; sprintId: number }) {
    const { issueKey, sprintId } = args;
    
    try {
      // First verify the sprint exists and get its details
      const sprintDetails = await this.makeJiraRequest(`agile/sprint/${sprintId}`);
      
      // Get current sprint of the issue (if any)
      const issueDetails = await this.makeJiraRequest(`agile/issue/${issueKey}`);
      const currentSprintId = issueDetails.fields?.sprint?.id;
      
      // Move the issue to the sprint
      await this.makeJiraRequest(`agile/sprint/${sprintId}/issue`, 'POST', {
        issues: [issueKey]
      });

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully moved issue ${issueKey}\n` +
                  `From: ${currentSprintId ? `Sprint ${currentSprintId}` : 'Backlog'}\n` +
                  `To: Sprint "${sprintDetails.name}" (ID: ${sprintId})\n\n` +
                  `Issue URL: ${JIRA_CONFIG.baseUrl}/browse/${issueKey}`
          }
        ]
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        throw new McpError(ErrorCode.InvalidParams, 
          `Sprint ${sprintId} not found or issue ${issueKey} cannot be moved to this sprint. ` +
          `Please verify the sprint ID and ensure the issue can be moved to sprints.`
        );
      }
      throw error;
    }
  }

  // Add new methods for enhanced functionality
  async getSprintIssues(args: { sprintId: number }) {
    const { sprintId } = args;
    
    const issues = await this.makeJiraRequest(`agile/sprint/${sprintId}/issue`);
    
    if (!issues.issues || issues.issues.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `ℹ️ No issues found in sprint ${sprintId}`
          }
        ]
      };
    }

    const issuesList = issues.issues.map((issue: JiraSprintIssue) => 
      `• **${issue.key}**: ${issue.fields.summary}\n` +
      `  Status: ${issue.fields.status.name}${
        issue.fields.assignee ? ` | Assignee: ${issue.fields.assignee.displayName}` : ''
      }`
    ).join('\n\n');

    return {
      content: [
        {
          type: "text",
          text: `📋 Issues in Sprint ${sprintId}:\n\n${issuesList}`
        }
      ]
    };
  }

  async getBoards(args: { projectKey: string }) {
    const { projectKey } = args;
    
    const boards = await this.makeJiraRequest(`agile/board?projectKeyOrId=${projectKey}`);
    
    if (!boards.values || boards.values.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `ℹ️ No boards found for project ${projectKey}`
          }
        ]
      };
    }

    const boardsList = boards.values.map((board: JiraBoard) => 
      `• **${board.name}** (${board.type})\n` +
      `  ID: ${board.id}${
        board.location ? `\n  Project: ${board.location.projectName} (${board.location.projectKey})` : ''
      }`
    ).join('\n\n');

    return {
      content: [
        {
          type: "text",
          text: `📊 Available Boards:\n\n${boardsList}`
        }
      ]
    };
  }

  async updateSprintDetails(args: { 
    sprintId: number;
    name?: string;
    goal?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { sprintId, name, goal, startDate, endDate } = args;
    
    const updateData: {
      name?: string;
      goal?: string;
      startDate?: string;
      endDate?: string;
    } = {};

    if (name) updateData.name = name;
    if (goal !== undefined) updateData.goal = goal;
    if (startDate) updateData.startDate = startDate;
    if (endDate) updateData.endDate = endDate;

    const updatedSprint = await this.makeJiraRequest(`agile/sprint/${sprintId}`, 'PUT', updateData);

    return {
      content: [
        {
          type: "text",
          text: `✅ Successfully updated sprint ${sprintId}\n\n` +
                `Name: ${updatedSprint.name}\n` +
                `State: ${updatedSprint.state}${
                  updatedSprint.goal ? `\nGoal: ${updatedSprint.goal}` : ''
                }${
                  updatedSprint.startDate ? `\nStart Date: ${new Date(updatedSprint.startDate).toLocaleDateString()}` : ''
                }${
                  updatedSprint.endDate ? `\nEnd Date: ${new Date(updatedSprint.endDate).toLocaleDateString()}` : ''
                }`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Jira MCP server running on stdio");
  }
}

const server = new JiraServer();
server.run().catch(console.error);