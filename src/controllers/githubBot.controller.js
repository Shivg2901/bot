import { IssueStatus, PRStatus } from '@prisma/client';
import prisma from '../config/db.config.js';
import { commentOnAPullRequest } from '../utils/commentOnAPullRequest.js';
import {
    CLOSED_ISSUE_PR_ERROR,
    commentBuilder,
    INVALID_ISSUE_NUMBER_ERROR,
    NOT_ASSIGNED_PR_ERROR,
    NOT_ASSIGNED_TO_YOU_PR_ERROR,
    NOT_REGISTERED_ASSIGNED_ERROR,
    PR_OPEN_SUCCESS,
    PR_OPENED_UNREGISTERED_ERROR,
    TEMPLATE_NOT_FOLLOWED_ERROR
} from '../utils/comments.js';
export const routerFunction = (req, res) => {
    switch (req.headers['x-github-event']) {
        case 'issues':
            switch (req.body.action) {
                case 'assigned':
                    issueAssigned(req, res);
                    break;
                case 'unassigned':
                    issueUnassigned(req, res);
                    break;
                case 'labeled':
                    issueLabeled(req, res);
                    break;
                case 'unlabeled':
                    issueUnlabeled(req, res);
                    break;
                case 'opened':
                    issueOpened(req, res);
                    break;
                case 'closed':
                    issueClosed(req, res);
                    break;
                case 'reopened':
                    issueReopened(req,res);
                    break;
                default:
                    return res.status(200).json();
            }
            break;

        case 'pull_request':
            switch (req.body.action) {
                case 'opened':
                    pullRequestOpened(req, res);
                    break;
                case 'edited':
                    pullRequestOpened(req, res);
                    break;
                case 'closed':
                    if (req.body.pull_request.merged)
                        pullRequestMerged(req, res);
                    else pullRequestClosed(req, res);
                    break;
                case 'reopened':
                    pullRequestReopened(req,res);
                    break;
                default:
                    return res.status(200).json();
            }
            break;

        default:
            return res.status(400);
    }
};

const issueAssigned = async (req, res) => {
    try {
        const issueNumber = req.body.issue.number;
        const repoName = req.body.repository.name;
        const githubId = req.body.assignee.login;

        const assigneeId = await prisma.participant.findUnique({
            where: {
                participantId: githubId
            }
        });
        if (!assigneeId) {
            commentOnAPullRequest(
                repoName,
                issueNumber,
                commentBuilder(githubId, NOT_REGISTERED_ASSIGNED_ERROR)
            );
        } else {
            await prisma.issue.update({
                where: {
                    repoName_issueNumber: {
                        repoName: repoName,
                        issueNumber: issueNumber
                    }
                },
                data: {
                    assigneeId: githubId,
                    status: IssueStatus.ASSIGNED
                }
            });
        }

        return res.status(200).json();
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};

const issueUnassigned = async (req, res) => {
    try {
        const issueNumber = req.body.issue.number;
        const repoName = req.body.repository.name;
        await prisma.issue.update({
            where: {
                repoName_issueNumber: {
                    repoName: repoName,
                    issueNumber: issueNumber
                }
            },
            data: {
                assigneeId: null,
                status: IssueStatus.OPEN
            }
        });
        return res.status(200).json();
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};

const issueLabeled = async (req, res) => {
    try {
        const issueNumber = req.body.issue.number;
        const repoName = req.body.repository.name;
        const label = req.body.label.name.trim().toLowerCase();
        const openForAll =
            label === 'everyone' ||
            label === 'open-for-all' ||
            label === 'competitive';
        const currentPoints = parseInt(label.match(/\d+/)?.at(0) ?? 0, 10);
        if (openForAll || currentPoints) {
            await prisma.issue.update({
                where: {
                    repoName_issueNumber: {
                        repoName: repoName,
                        issueNumber: issueNumber
                    }
                },
                data: {
                    ...(openForAll && { openForAll: true }),
                    ...(currentPoints !== 0 && { currentPoints: currentPoints })
                }
            });
        }
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};

const issueUnlabeled = async (req, res) => {
    try {
        const issueNumber = req.body.issue.number;
        const repoName = req.body.repository.name;
        const label = req.body.label.name.trim().toLowerCase();
        const openForAll = !['everyone', 'open-for-all', 'competitive'].some(
            (keyword) => label.trim().toLowerCase() === keyword
        );
        if (!openForAll) {
            await prisma.issue.update({
                where: {
                    repoName_issueNumber: {
                        repoName: repoName,
                        issueNumber: issueNumber
                    }
                },
                data: {
                    openForAll: openForAll
                }
            });
        }
    } catch (error) {
        console.log(error);
        return res.status(200).json();
    }
};

const issueOpened = async (req, res) => {
    try {
        const {
            repository: { name: repoName },
            issue: { title, number: issueNumber, labels }
        } = req.body;
        let openForAll = false;
        let currentPoints = 0;
        labels.forEach(({ name: label }) => {
            if (
                ['everyone', 'open-for-all', 'competitive'].some(
                    (keyword) => label.trim().toLowerCase() === keyword
                )
            ) {
                openForAll = true;
            }
            if (label.toLowerCase().includes('point')) {
                currentPoints = parseInt(label.match(/\d+/)?.at(0) ?? 0, 10);
            }
        });
        await prisma.issue.create({
            data: {
                repoName: repoName,
                title: title,
                issueNumber: issueNumber,
                openForAll: openForAll,
                currentPoints: currentPoints
            }
        });
        return res.status(200).json();
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};

const issueClosed = async (req, res) => {
    try {
        const issueNumber = req.body.issue.number;
        const repoName = req.body.repository.name;

        await prisma.issue.update({
            where: {
                repoName_issueNumber: {
                    repoName: repoName,
                    issueNumber: issueNumber
                }
            },
            data: {
                status: IssueStatus.CLOSED
            }
        });
        return res.status(200).json();
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};

const issueReopened = async (req, res) => {
    try {
        const issueNumber = req.body.issue.number;
        const repoName = req.body.repository.name;

        await prisma.issue.update({
            where: {
                repoName_issueNumber: {
                    repoName: repoName,
                    issueNumber: issueNumber
                }
            },
            data: {
                status: IssueStatus.OPEN
            }
        });
        return res.status(200).json();
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};

const pullRequestOpened = async (req, res) => {
    try {
        const githubId = req.body.pull_request.user.login;
        const repoName = req.body.repository.name;
        const { body, number: PRNumber, title, id } = req.body.pull_request;
        const issueNumber = parseInt(body.match(/Issue\s*:\s*#(\d+)/i)?.[1],10);
        if (issueNumber) {
            const participant = await prisma.participant.findUnique({
                where: {
                    participantId: githubId
                }
            });

            if (!participant) {
                commentOnAPullRequest(
                    repoName,
                    PRNumber,
                    commentBuilder(githubId, PR_OPENED_UNREGISTERED_ERROR)
                );
            } else {
                const issue = await prisma.issue.findUnique({
                    where: {
                        repoName_issueNumber: {
                            repoName: repoName,
                            issueNumber: issueNumber
                        }
                    },
                    select: {
                        id: true,
                        status: true,
                        currentPoints: true,
                        openForAll: true,
                        assigneeId: true
                    }
                });
                if (!issue) {
                    commentOnAPullRequest(
                        repoName,
                        PRNumber,
                        commentBuilder(githubId, INVALID_ISSUE_NUMBER_ERROR)
                    );
                } else if (issue.status === IssueStatus.CLOSED) {
                    commentOnAPullRequest(
                        repoName,
                        PRNumber,
                        commentBuilder(githubId, CLOSED_ISSUE_PR_ERROR)
                    );
                } else if (
                    issue.status === IssueStatus.ASSIGNED &&
                    issue.openForAll === false
                ) {
                    if (participant.participantId === issue.assigneeId) {
                        await prisma.pR.create({
                            data: {
                                id: id,
                                title: title,
                                submitterId: participant.participantId,
                                issueId: issue.id,
                                prNumber: PRNumber,
                                points: issue.currentPoints
                            }
                        });
                        commentOnAPullRequest(
                            repoName,
                            PRNumber,
                            commentBuilder(githubId, PR_OPEN_SUCCESS)
                        );
                    } else {
                        commentOnAPullRequest(
                            repoName,
                            PRNumber,
                            commentBuilder(
                                githubId,
                                NOT_ASSIGNED_TO_YOU_PR_ERROR
                            )
                        );
                    }
                } else if (
                    issue.status === IssueStatus.OPEN &&
                    issue.openForAll === false
                ) {
                    commentOnAPullRequest(
                        repoName,
                        PRNumber,
                        commentBuilder(githubId, NOT_ASSIGNED_PR_ERROR)
                    );
                } else {
                    console.log('yha');
                    await prisma.pR.create({
                        data: {
                            id: id,
                            title: title,
                            submitterId: participant.participantId,
                            issueId: issue.id,
                            prNumber: PRNumber,
                            points: issue.currentPoints
                        }
                    });
                    commentOnAPullRequest(
                        repoName,
                        PRNumber,
                        commentBuilder(githubId, PR_OPEN_SUCCESS)
                    );
                }
            }
        } else {
            commentOnAPullRequest(
                repoName,
                PRNumber,
                commentBuilder(TEMPLATE_NOT_FOLLOWED_ERROR)
            );
        }
        return res.status(200).json();
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};

const pullRequestClosed = async (req, res) => {
    try {
        const { number: PRNumber, id } = req.body.pull_request;
        await prisma.pR.update({
            where: {
                id: id,
                prNumber: PRNumber
            },
            data: {
                status: PRStatus.REJECTED
            }
        });
        return res.status(200).json();
    } catch (error) {
        return res.status(200).json();
    }
};

const pullRequestReopened = async (req, res) => {
    try {
        const { number: PRNumber, id } = req.body.pull_request;
        await prisma.pR.update({
            where: {
                id: id,
                prNumber: PRNumber
            },
            data: {
                status: PRStatus.OPENED
            }
        });
        return res.status(200).json();
    } catch (error) {
        return res.status(200).json();
    }
};

const pullRequestMerged = async (req, res) => {
    try {
        const repoName = req.body.repository.name;
        const { id, number: PRNumber, body } = req.body.pull_request;
        const githubId = req.body.pull_request.user.login;
        const issueNumber = parseInt(
            body.match(/Issue\s*:\s*#(\d+)/i)?.[1],
            10
        );
        if (!issueNumber) {
            commentOnAPullRequest(
                repoName,
                PRNumber,
                commentBuilder(TEMPLATE_NOT_FOLLOWED_ERROR)
            );
            return res.status(200).json();
        }
        const issueData = await prisma.issue.findUnique({
            where: {
                repoName_issueNumber: {
                    repoName: repoName,
                    issueNumber: issueNumber
                },
                OR: [
                    {
                        openForAll: true
                    },
                    {
                        status: IssueStatus.ASSIGNED,
                        assigneeId: githubId
                    }
                ]
            },
            include: {
                repo: {
                    select: {
                        eventName: true
                    }
                }
            }
        });
        const eventName = issueData.repo.eventName;
        const currentPoints = issueData.currentPoints;
        await prisma.pR.update({
            where: {
                id: id,
                prNumber: PRNumber
            },
            data: {
                status: PRStatus.MERGED,
                points: currentPoints,
                submitter: {
                    update: {
                        LeaderboardEntries: {
                            update: {
                                where: {
                                    participantId_eventName: {
                                        participantId: githubId,
                                        eventName: eventName
                                    }
                                },
                                data: {
                                    points: {
                                        increment: currentPoints
                                    },
                                    PRmerged: {
                                        increment: 1
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        // OpenCode
        // const PR_MERGED = `Hey @${githubId}\n\nYour PR has been merged 🥳🥳 and you have earned **${currentPoints} points**. \n\nThanks for contributing in OpenCode\'23 ✨✨`;
        // GeekCamp
        const PR_MERGED = `Hey @${githubId}\n\nYour PR has been merged 🥳🥳 and you have earned **${currentPoints} points**. \n\nThanks for participating in GeekCamp ✨✨`;
        commentOnAPullRequest(repoName, PRNumber, PR_MERGED);

        return res.status(200).json();
    } catch (error) {
        console.error(error);
        return res.status(200).json();
    }
};
