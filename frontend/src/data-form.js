import { useEffect, useMemo, useState } from 'react';
import {
    Box,
    TextField,
    Button,
    Typography,
    Paper,
    Chip,
    FormControlLabel,
    Switch,
} from '@mui/material';
import axios from 'axios';
import React from 'react';

const endpointMapping = {
    'Notion': 'notion',
    'Airtable': 'airtable',
    'HubSpot': 'hubspot',
};

const miniCardStyle = { p: 2, minWidth: 180, flex: 1 };

const renderInlineBold = (text) => {
    const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={`b-${idx}`}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={`t-${idx}`}>{part}</React.Fragment>;
    });
};

const renderLlmInsight = (text) => {
    const lines = String(text || '').split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*')) {
            return <Typography key={`llm-${idx}`} sx={{ ml: 2 }}>• {renderInlineBold(trimmed.replace(/^\*\s*/, ''))}</Typography>;
        }
        if (/^\d+\./.test(trimmed)) {
            return <Typography key={`llm-${idx}`} sx={{ mt: 1, fontWeight: 700 }}>{renderInlineBold(trimmed)}</Typography>;
        }
        return <Typography key={`llm-${idx}`} sx={{ mt: 0.5 }}>{renderInlineBold(trimmed)}</Typography>;
    });
};

export const DataForm = ({ integrationType, credentials, aiMode, user, org }) => {
    const [loadedData, setLoadedData] = useState(null);
    const [insights, setInsights] = useState(null);
    const [insightsObj, setInsightsObj] = useState(null);
    const [llmInsights, setLlmInsights] = useState(null);
    const [analystPrompt, setAnalystPrompt] = useState('');
    const [showLlmOutput, setShowLlmOutput] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [notionToken, setNotionToken] = useState('');
    const [notionParentPageId, setNotionParentPageId] = useState('');
    const [publishResult, setPublishResult] = useState(null);
    const endpoint = endpointMapping[integrationType];
    const parsedLoaded = useMemo(() => {
        if (!loadedData) return [];
        try {
            return JSON.parse(loadedData);
        } catch {
            return [];
        }
    }, [loadedData]);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                if (!user || !org) return;
                const formData = new FormData();
                formData.append('user_id', user);
                formData.append('org_id', org);
                const response = await axios.post('http://localhost:8000/integrations/settings/get', formData);
                setNotionToken(response.data?.notion_access_token || '');
                setNotionParentPageId(response.data?.notion_parent_page_id || '');
            } catch {
                // no-op, settings are optional
            }
        };
        loadSettings();
    }, [user, org]);

    const handleLoad = async () => {
        try {
            const formData = new FormData();
            formData.append('credentials', JSON.stringify(credentials));
            const response = await axios.post(`http://localhost:8000/integrations/${endpoint}/load`, formData);
            const data = response.data;
            setLoadedData(JSON.stringify(data, null, 2));
            setInsights(null);
            setInsightsObj(null);
            setLlmInsights(null);
            setShowLlmOutput(false);
        } catch (e) {
            alert(e?.response?.data?.detail);
        }
    };

    const handleInsights = async () => {
        try {
            if (!loadedData) {
                alert('Load integration data before generating insights.');
                return;
            }
            const formData = new FormData();
            formData.append('integration_type', integrationType);
            formData.append('items', loadedData);
            const response = await axios.post('http://localhost:8000/integrations/insights', formData);
            setInsights(JSON.stringify(response.data, null, 2));
            setInsightsObj(response.data);
        } catch (e) {
            alert(e?.response?.data?.detail);
        }
    };

    const handleLlmInsights = async () => {
        try {
            if (!loadedData) {
                alert('Load integration data before generating LLM insights.');
                return;
            }
            const formData = new FormData();
            formData.append('integration_type', integrationType);
            formData.append('items', loadedData);
            formData.append('analyst_prompt', analystPrompt);
            const response = await axios.post('http://localhost:8000/integrations/insights/llm', formData);
            setLlmInsights(response.data);
            setShowLlmOutput(true);
        } catch (e) {
            alert(e?.response?.data?.detail);
        }
    };

    const clearAll = () => {
        setLoadedData(null);
        setInsights(null);
        setInsightsObj(null);
        setLlmInsights(null);
        setAnalystPrompt('');
        setShowLlmOutput(false);
        setSelectedMetric(null);
        setPublishResult(null);
    };

    const handlePublishToNotion = async () => {
        try {
            if (!insightsObj) {
                alert('Generate ML Insights before publishing.');
                return;
            }
            if (!notionToken || !notionParentPageId) {
                alert('Provide Notion access token and parent page ID.');
                return;
            }
            const formData = new FormData();
            formData.append('integration_type', integrationType);
            formData.append('insights', JSON.stringify(insightsObj));
            formData.append('notion_access_token', notionToken);
            formData.append('notion_parent_page_id', notionParentPageId);
            const response = await axios.post('http://localhost:8000/integrations/insights/publish-notion', formData);
            setPublishResult(response.data);
        } catch (e) {
            alert(e?.response?.data?.detail);
        }
    };

    const handleSaveSettings = async () => {
        try {
            if (!user || !org) {
                alert('User and org are required to save settings.');
                return;
            }
            const formData = new FormData();
            formData.append('user_id', user);
            formData.append('org_id', org);
            formData.append('notion_access_token', notionToken);
            formData.append('notion_parent_page_id', notionParentPageId);
            await axios.post('http://localhost:8000/integrations/settings/save', formData);
            alert('Settings saved to Redis.');
        } catch (e) {
            alert(e?.response?.data?.detail || 'Failed to save settings.');
        }
    };

    const metricCards = [
        { key: 'items_loaded', label: 'Items Loaded', value: `${parsedLoaded.length}`, detail: `Total normalized records loaded from ${integrationType}.` },
        { key: 'health_score', label: 'Health Score', value: `${insightsObj?.health_score ?? 0}/100`, detail: 'Composite quality score from completeness and freshness.' },
        { key: 'stale_records', label: 'Stale Records', value: `${insightsObj?.stale_items ?? 0}`, detail: 'Records with no recent activity (>30 days).' },
        { key: 'completeness', label: 'Completeness', value: `${insightsObj?.completeness_pct ?? 0}%`, detail: 'Share of records with required identity fields present.' },
        { key: 'freshness', label: 'Freshness (30d)', value: `${insightsObj?.freshness_pct ?? 0}%`, detail: 'Share of records active in the last 30 days.' },
        { key: 'automation_opportunity', label: 'Automation Opportunity', value: `${insightsObj?.automation_opportunity_score ?? 0}/100`, detail: 'Higher score means more automation potential from data gaps and process risk.' },
        { key: 'time_saved', label: 'Est. Time Saved / Month', value: `${insightsObj?.estimated_hours_saved_monthly ?? 0}h`, detail: 'Estimated manual review effort avoided via automation.' },
        { key: 'deals_missing_stage', label: 'Deals Missing Stage', value: `${insightsObj?.deals_missing_stage ?? 0}`, detail: 'Deals without stage are hard to forecast and route.' },
        { key: 'contacts_missing_email', label: 'Contacts Missing Email', value: `${insightsObj?.contacts_missing_email ?? 0}`, detail: 'Contacts missing email cannot be reached by outbound automations.' },
    ];

    const selectedCard = metricCards.find((c) => c.key === selectedMetric);
    const healthExplain = insightsObj?.explainability?.health_score;
    const autoExplain = insightsObj?.explainability?.automation_opportunity_score;
    const trendValues = insightsObj?.activity_timeline_last_4_weeks || [];
    const ageEntries = Object.entries(insightsObj?.age_buckets || {});
    const trendMax = Math.max(1, ...trendValues);
    const ageMax = Math.max(1, ...ageEntries.map(([, v]) => Number(v || 0)));

    if (!aiMode) {
        return (
            <Box display='flex' justifyContent='center' alignItems='center' flexDirection='column' width='100%'>
                <Box display='flex' flexDirection='column' width='100%'>
                    <TextField label="Loaded Data" value={loadedData || ''} sx={{mt: 2}} InputLabelProps={{ shrink: true }} disabled />
                    <Button onClick={handleLoad} sx={{mt: 2}} variant='contained'>Load Data</Button>
                    <Button onClick={clearAll} sx={{mt: 1}} variant='contained'>Clear Data</Button>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ width: 'min(1000px, 92vw)', mt: 2 }}>
            <Typography variant='h6' sx={{ mb: 1 }}>AI Insights Dashboard</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Paper elevation={2} sx={miniCardStyle}>
                    <Typography variant='body2'>Integration</Typography>
                    <Typography variant='h6'>{integrationType}</Typography>
                </Paper>
                {metricCards.map((card) => (
                    <Paper
                        key={card.key}
                        elevation={selectedMetric === card.key ? 6 : 2}
                        onClick={() => setSelectedMetric(card.key)}
                        sx={{
                            ...miniCardStyle,
                            cursor: 'pointer',
                            border: selectedMetric === card.key ? '2px solid #0077B6' : '2px solid transparent',
                        }}
                    >
                        <Typography variant='body2'>{card.label}</Typography>
                        <Typography variant='h6'>{card.value}</Typography>
                    </Paper>
                ))}
            </Box>

            {selectedCard && (
                <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                    <Typography variant='subtitle1'>Metric Explainability: {selectedCard.label}</Typography>
                    <Typography variant='body2' sx={{ mt: 1 }}>{selectedCard.detail}</Typography>
                    {selectedMetric === 'health_score' && healthExplain && (
                        <Box sx={{ mt: 1 }}>
                            <Typography variant='body2'><strong>Formula:</strong> {healthExplain.formula}</Typography>
                            {healthExplain.contributors.map((c) => (
                                <Typography key={`h-${c.feature}`} variant='body2'>
                                    - {c.feature}: value {c.value}, weight {c.weight}, contribution {c.impact}
                                </Typography>
                            ))}
                        </Box>
                    )}
                    {selectedMetric === 'automation_opportunity' && autoExplain && (
                        <Box sx={{ mt: 1 }}>
                            <Typography variant='body2'><strong>Formula:</strong> {autoExplain.formula}</Typography>
                            {autoExplain.contributors.map((c) => (
                                <Typography key={`a-${c.feature}`} variant='body2'>
                                    - {c.feature}: value {c.value}, weight {c.weight}, contribution {c.impact}
                                </Typography>
                            ))}
                        </Box>
                    )}
                </Paper>
            )}

            <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                <Typography variant='subtitle1'>Activity Trend (Last 4 Weeks)</Typography>
                <Box sx={{ mt: 1, display: 'grid', gap: 1 }}>
                    {trendValues.map((value, idx) => (
                        <Box key={`activity-${idx}`} sx={{ display: 'grid', gridTemplateColumns: '44px 1fr 48px', alignItems: 'center', gap: 1 }}>
                            <Typography variant='caption'>W{idx + 1}</Typography>
                            <Box sx={{ height: 12, borderRadius: 1, background: '#e6eef8', overflow: 'hidden' }}>
                                <Box sx={{ height: '100%', width: `${Math.max(3, (Number(value || 0) / trendMax) * 100)}%`, background: 'linear-gradient(90deg, #0077B6, #00A86B)' }} />
                            </Box>
                            <Typography variant='caption'>{value}</Typography>
                        </Box>
                    ))}
                </Box>
            </Paper>
            <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                <Typography variant='subtitle1'>Age Distribution</Typography>
                <Box sx={{ mt: 1, display: 'grid', gap: 1 }}>
                    {ageEntries.map(([bucket, value]) => (
                        <Box key={`bucket-${bucket}`} sx={{ display: 'grid', gridTemplateColumns: '64px 1fr 48px', alignItems: 'center', gap: 1 }}>
                            <Typography variant='caption'>{bucket}</Typography>
                            <Box sx={{ height: 12, borderRadius: 1, background: '#f0ebff', overflow: 'hidden' }}>
                                <Box sx={{ height: '100%', width: `${Math.max(3, (Number(value || 0) / ageMax) * 100)}%`, background: 'linear-gradient(90deg, #9b5de5, #00A86B)' }} />
                            </Box>
                            <Typography variant='caption'>{value}</Typography>
                        </Box>
                    ))}
                </Box>
            </Paper>
            <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                <Typography variant='subtitle1'>Type Distribution</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                    {Object.entries(insightsObj?.counts_by_type || {}).map(([key, value]) => (
                        <Chip key={`type-${key}`} label={`${key}: ${value}`} color='primary' variant='outlined' />
                    ))}
                </Box>
            </Paper>
            <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                <Typography variant='subtitle1'>Recommended Actions</Typography>
                <Box sx={{ mt: 1 }}>
                    {(insightsObj?.recommended_actions || []).map((action, idx) => (
                        <Typography key={`action-${idx}`} variant='body2'>{idx + 1}. {action}</Typography>
                    ))}
                </Box>
            </Paper>

            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                <Button onClick={handleLoad} variant='contained'>Load Data</Button>
                <Button onClick={handleInsights} variant='contained' color='success'>Generate ML Insights</Button>
                <Button onClick={handleLlmInsights} variant='contained' color='secondary'>Generate LLM Insights (Gemini)</Button>
                <Button onClick={clearAll} variant='outlined'>Clear</Button>
            </Box>
            <Typography variant='body2' sx={{ mt: 1 }}>
                Data Load Status: {loadedData ? `Loaded ${parsedLoaded.length} records. Click "Generate ML Insights" to compute dashboard metrics.` : 'Not loaded'}
            </Typography>

            <TextField
                label="Analyst Prompt (Customize LLM Focus)"
                placeholder="Example: Focus on stale records and suggest 3 automations for sales follow-up."
                value={analystPrompt}
                onChange={(e) => setAnalystPrompt(e.target.value)}
                sx={{mt: 2}}
                InputLabelProps={{ shrink: true }}
                multiline
                minRows={2}
                fullWidth
            />
            <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                <Typography variant='subtitle1'>Publish Report to Notion</Typography>
                <TextField
                    label="Notion Access Token"
                    value={notionToken}
                    onChange={(e) => setNotionToken(e.target.value)}
                    sx={{ mt: 1 }}
                    fullWidth
                />
                <TextField
                    label="Notion Parent Page ID"
                    value={notionParentPageId}
                    onChange={(e) => setNotionParentPageId(e.target.value)}
                    sx={{ mt: 1 }}
                    fullWidth
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button onClick={handleSaveSettings} variant='outlined'>
                        Save Settings
                    </Button>
                    <Button onClick={handlePublishToNotion} variant='contained' color='info'>
                    Publish to Notion
                    </Button>
                </Box>
                {publishResult?.notion_page_url && (
                    <Typography sx={{ mt: 1 }}>
                        Published: <a href={publishResult.notion_page_url} target="_blank" rel="noreferrer">{publishResult.notion_page_url}</a>
                    </Typography>
                )}
            </Paper>
            {showLlmOutput && (
                <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                    <Typography variant='subtitle1'>LLM Insights</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                        <Chip label={`Provider: ${llmInsights?.provider || 'unknown'}`} variant='outlined' />
                        <Chip label={`Status: ${llmInsights?.status || 'unknown'}`} color={llmInsights?.status === 'ok' ? 'success' : 'warning'} />
                    </Box>
                    <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        {renderLlmInsight(llmInsights?.insight || 'No LLM response yet.')}
                    </Typography>
                </Paper>
            )}
            <FormControlLabel
                sx={{ mt: 1 }}
                control={<Switch checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} />}
                label="Show Debug JSON"
            />
            {showDebug && (
                <>
                    <TextField
                        label="Loaded Data (Raw)"
                        value={loadedData || ''}
                        sx={{mt: 1}}
                        InputLabelProps={{ shrink: true }}
                        disabled
                        multiline
                        minRows={5}
                        fullWidth
                    />
                    <TextField
                        label="ML Based Insights (Raw)"
                        value={insights || ''}
                        sx={{mt: 2}}
                        InputLabelProps={{ shrink: true }}
                        disabled
                        multiline
                        minRows={5}
                        fullWidth
                    />
                    <TextField
                        label="LLM Insights (Raw)"
                        value={llmInsights ? JSON.stringify(llmInsights, null, 2) : ''}
                        sx={{mt: 2}}
                        InputLabelProps={{ shrink: true }}
                        disabled
                        multiline
                        minRows={5}
                        fullWidth
                    />
                </>
            )}
        </Box>
    );
};
