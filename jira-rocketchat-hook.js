/*jshint  esnext:true*/
const DESC_MAX_LENGTH = 140;
const JIRA_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACRElEQVRYhbWXsUscQRTGf4iIyHHIISIWIsHisMgfkNIiBJFwiKQIkipVqpA/wEZEggSxEkmZwiKI5A84REKKkIMQrINYBQmHBDmEHJdNMW+42dk3d3O76wcDu2/e973vZvfN7EF+PAfaMjYL6AzFJFBRYh0gkdEBpryciuQVwjPgFugCu068CvQcAz1g2pnfEc6taOTGL6dIAjxw5nad+FsnvuhxrosYuPbElrz5Rc8Ucu9yfhcxsAncYZZ4fwTeO+HcUcILWgFqOXg1si9vFBrAXB7iEMySfYQZzGCeWxdoAq+Bh8BYjoJjwn0jWrYrqsOIbdIvUQLseTmPgHXgiYx1ibnYU3RuYpyfKMQ/mNWx+KzkfHHmZ4Tj55zGGNhQiAlw5OQ8VeYbzvxRQCNqUxoHLgMCa07eRyd+4sTXAtwrYCLGAJje1URugLrkVIHvMuyLVZccjfsitrhFMyD0k36bTtA/cOZkTuOckaOTFtA7IgEuSG9ONeBHILctWrnwGNO/mvA3zAk4LddaThfTpoXwKiBuVyL0yxPhloLtAUVCY7us4hb7IxQ/KLu4xWFE8cP7Kg6mld4PKH5BvoNrZBMfBphohKnFMAusyvU48ClgoA3M34eBUynwUu6ngK8BE1Gn3ihYccR79Jd5nuyXsx0rZRo498Q7mK8dMDudZuC8rOLLgQI7Ts5xIGe5DANbinCP9AfmEul/SnZslWHgTBFuKnna8a3lpRCzadSVWMiAj6GPIMbAX+/+H9BS8loyN4ibwX9j/jIXDkk+pgAAAABJRU5ErkJggg==';
function stripDesc(str) {
	return (str && str.length > DESC_MAX_LENGTH) ? str.slice(0, DESC_MAX_LENGTH - 3) + '...' : str;
}

function prepareAttachment({issue, user}, text) { //handler for standart webhooks
	var issueType = issue.fields.issuetype;
	var res = {
		author_name: user.displayName
		, author_icon: user.avatarUrls['24x24']
		, thumb_url: issueType.iconUrl
	};
	if (text) {
		text = text.replace(/\{\{(user|issue)\.([^a-z_0-9]+)\}\}/g, (m, type, key) => (type==='user' ? user : issue)[key]);
		res.text = text;
	}
	return res;
}
class Script {
	process_incoming_request({request}) {
		const data = request.content;
		try {
			if (data.issue) { //standart jira webhook
				var issue = data.issue;
				var baseJiraUrl = issue.self.replace(/\/rest\/.*$/, '');
				var user = data.user;
				var assignedTo = (issue.fields.assigned && issue.fields.assigned.name !== user.name) ? `, assigned to ${issue.fields.assigned.name}` : '';
				var issueSummary = `[${issue.key}](${baseJiraUrl}/browse/${issue.key}) ${issue.fields.summary} _(${issue.fields.priority.name.replace(/^\s*\d*\.\s*/, '')}${assignedTo})_`;
				var message = {
				icon_url: (issue.fields.project && issue.fields.project.avatarUrls && issue.fields.project.avatarUrls['48x48']) || JIRA_LOGO
				, attachments: []			};
				
			} else{ //"automation for jira" webhook
				var issue = data;
				var baseJiraUrl = data.self.replace(/\/rest\/.*$/, '');
				var assignedTo = (data.fields.assigned && data.fields.assigned.name !== user.name) ? `, assigned to ${data.fields.assigned.name}` : '';
				var issueSummary = `[${data.key}](${baseJiraUrl}/browse/${data.key}) ${data.fields.summary} _(${data.fields.priority.name.replace(/^\s*\d*\.\s*/, '')}${assignedTo})_`;
				var message = {
				icon_url: (data.fields.project && data.fields.project.avatarUrls && data.fields.project.avatarUrls['48x48']) || JIRA_LOGO
				, attachments: []
				
			}
			
			};

			if (data.webhookEvent === 'jira:issue_created') {
				message.attachments.push(prepareAttachment(data, `*Created* ${issueSummary}:\n${stripDesc(issue.fields.description)}`));
			} else if (data.webhookEvent === 'jira:issue_deleted') {
				message.attachments.push(prepareAttachment(data, `*Deleted* ${issueSummary}`));
			} else 
				if (data.webhookEvent === 'jira:issue_updated') {
				if (data.changelog && data.changelog.items) { // field update
					var logs = [];
					data.changelog.items.forEach((change) => {
						if (!change.field.match('status|resolution|comment|priority') ) {
							return;
						}
						if (change.field==='description') {
							logs.push(`Changed *description* to:\n${stripDesc(change.toString)}`);
						} else {
							logs.push(`*${change.field}* changed from ${change.fromString} to *${change.toString}*`);
						}
					});
					logs.length && message.attachments.push(prepareAttachment(data, `*Updated* ${issueSummary}:\n  - ${logs.join('\n  - ')}`));
				}

				if (data.comment) { // comment update
					var comment = data.comment;
					var action = comment.created !== comment.updated ? 'Updated comment' : 'Commented';
					message.attachments.push(prepareAttachment(data, `*${action}* on ${issueSummary}:\n${stripDesc(comment.body)}`));
				}
			}
			  else { //handler for custom webhooks data
					var issueType = data.fields.issuetype;
					var res = {
					thumb_url: issueType.iconUrl};
					var text = `*SLA Alert* ${issueSummary}:\n${stripDesc(data.fields.description)}`;
					if (text) {
						text = text.replace(/\{\{(user|issue)\.([^a-z_0-9]+)\}\}/g, (m, type, key) => (type==='user' ? user : issue)[key]);
						res.text = text;
								}
					message.attachments.push(res);			  	 
			  }	
			
			if (message.text || message.attachments.length) {
				return {content:message};
			}
		} catch(e) {
			console.log('jiraevent error', e);
			return {
				error: {
					success: false,
					message: `${e.message || e} ${JSON.stringify(data)}`
				}
			};
		}
	}
}
