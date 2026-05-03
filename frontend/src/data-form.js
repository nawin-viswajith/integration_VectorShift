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
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Pagination,
} from '@mui/material';
import axios from 'axios';
import React from 'react';

const endpointMapping = {
    Notion: 'notion',
    Airtable: 'airtable',
    HubSpot: 'hubspot',
};

const miniCardStyle = { p: 2, minWidth: 180, flex: 1 };
const DEFAULT_ANALYST_PROMPT = 'Prioritize practical, high-ROI automations. Explain key risks, top opportunities, and immediate next actions for a CRM ops analyst.';
const PAGE_SIZE = 9;

const renderInlineMarkdown = (text) => {
    const src = String(text || '');
    const tokens = src.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g).filter((t) => t.length > 0);
    return tokens.map((token, idx) => {
        if (token.startsWith('**') && token.endsWith('**')) {
            return <strong key={`md-b-${idx}`}>{token.slice(2, -2)}</strong>;
        }
        if (token.startsWith('*') && token.endsWith('*')) {
            return <em key={`md-e-${idx}`}>{token.slice(1, -1)}</em>;
        }
        if (token.startsWith('`') && token.endsWith('`')) {
            return <code key={`md-c-${idx}`}>{token.slice(1, -1)}</code>;
        }
        return <React.Fragment key={`md-t-${idx}`}>{token}</React.Fragment>;
    });
};

const normalizeLine = (line) => {
    let out = String(line || '').replace(/\r/g, '').trim();
    out = out.replace(/^•\s*/, '- ');
    out = out.replace(/^-\s*\*/, '- ');
    out = out.replace(/^\*\s+/, '');
    out = out.replace(/^-+\s*\*(\d+\)\s+)/, '$1');
    out = out.replace(/^-+\s*\*\*(.+)\*\*\s*$/, '**$1**');
    return out;
};

const renderLlmInsight = (text) => {
    const lines = String(text || '').split('\n').map((l) => normalizeLine(l));
    const blocks = [];
    let ul = [];
    let ol = [];

    const flushUl = () => {
        if (ul.length) {
            blocks.push(
                <Box component='ul' key={`ul-${blocks.length}`} sx={{ mt: 0.8, mb: 0.8, pl: 3 }}>
                    {ul.map((item, idx) => <li key={`uli-${idx}`}>{renderInlineMarkdown(item)}</li>)}
                </Box>
            );
            ul = [];
        }
    };

    const flushOl = () => {
        if (ol.length) {
            blocks.push(
                <Box component='ol' key={`ol-${blocks.length}`} sx={{ mt: 0.8, mb: 0.8, pl: 3 }}>
                    {ol.map((item, idx) => <li key={`oli-${idx}`}>{renderInlineMarkdown(item)}</li>)}
                </Box>
            );
            ol = [];
        }
    };

    lines.forEach((raw, idx) => {
        const line = raw.trim();
        if (!line) {
            flushUl();
            flushOl();
            return;
        }

        const numberedHeader = line.match(/^\**\s*(\d+)\)\s+(.+?)\**$/);
        if (numberedHeader) {
            flushUl();
            flushOl();
            blocks.push(
                <Typography key={`h-${idx}`} sx={{ mt: 1.2, fontWeight: 700 }}>
                    {renderInlineMarkdown(`${numberedHeader[1]}) ${numberedHeader[2]}`)}
                </Typography>
            );
            return;
        }

        const ulMatch = line.match(/^[-*]\s+(.+)$/);
        if (ulMatch) {
            flushOl();
            ul.push(ulMatch[1]);
            return;
        }

        const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
        if (olMatch) {
            flushUl();
            ol.push(olMatch[2]);
            return;
        }

        flushUl();
        flushOl();
        const strongOnly = line.match(/^\*\*(.+)\*\*:?$/);
        if (strongOnly) {
            blocks.push(
                <Typography key={`s-${idx}`} sx={{ mt: 1, fontWeight: 700 }}>
                    {renderInlineMarkdown(line)}
                </Typography>
            );
            return;
        }
        blocks.push(
            <Typography key={`p-${idx}`} sx={{ mt: /:$/.test(line) ? 1 : 0.5, fontWeight: /:$/.test(line) ? 600 : 400 }}>
                {renderInlineMarkdown(line)}
            </Typography>
        );
    });

    flushUl();
    flushOl();
    return blocks;
};

const pretty = (v) => (v === null || v === undefined || v === '' ? 'N/A' : String(v));

export const DataForm = ({ integrationType, credentials, aiMode, user, org }) => {
    const [loadedData, setLoadedData] = useState(null);
    const [insights, setInsights] = useState(null);
    const [insightsObj, setInsightsObj] = useState(null);
    const [llmInsights, setLlmInsights] = useState(null);
    const [analystPrompt, setAnalystPrompt] = useState(DEFAULT_ANALYST_PROMPT);
    const [showPromptBox, setShowPromptBox] = useState(false);
    const [showLlmOutput, setShowLlmOutput] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [notionToken, setNotionToken] = useState('');
    const [notionParentPageId, setNotionParentPageId] = useState('');
    const [publishResult, setPublishResult] = useState(null);
    const [showNotionConfig, setShowNotionConfig] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isGeneratingMl, setIsGeneratingMl] = useState(false);
    const [isGeneratingLlm, setIsGeneratingLlm] = useState(false);

    const [typeFilter, setTypeFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [selectedRecord, setSelectedRecord] = useState(null);

    const endpoint = endpointMapping[integrationType];

    const parsedLoaded = useMemo(() => {
        if (!loadedData) return [];
        try {
            return JSON.parse(loadedData);
        } catch {
            return [];
        }
    }, [loadedData]);

    const typeOptions = useMemo(() => {
        const base = ['all'];
        const found = [...new Set(parsedLoaded.map((x) => (x?.type || '').toLowerCase()).filter(Boolean))];
        return [...base, ...found];
    }, [parsedLoaded]);

    const filteredItems = useMemo(() => {
        if (typeFilter === 'all') return parsedLoaded;
        return parsedLoaded.filter((x) => (x?.type || '').toLowerCase() === typeFilter);
    }, [parsedLoaded, typeFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
    const pageItems = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filteredItems.slice(start, start + PAGE_SIZE);
    }, [filteredItems, page]);

    useEffect(() => {
        if (page > totalPages) setPage(1);
    }, [totalPages, page]);

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
                // optional settings
            }
        };
        loadSettings();
    }, [user, org]);

    const handleLoad = async () => {
        try {
            setIsLoadingData(true);
            const formData = new FormData();
            formData.append('credentials', JSON.stringify(credentials));
            const response = await axios.post(`http://localhost:8000/integrations/${endpoint}/load`, formData);
            const data = response.data;
            setLoadedData(JSON.stringify(data, null, 2));
            setInsights(null);
            setInsightsObj(null);
            setLlmInsights(null);
            setShowLlmOutput(false);
            setTypeFilter('all');
            setPage(1);
        } catch (e) {
            alert(e?.response?.data?.detail);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleInsights = async () => {
        try {
            if (!loadedData) {
                alert('Load integration data before generating insights.');
                return;
            }
            setIsGeneratingMl(true);
            const formData = new FormData();
            formData.append('integration_type', integrationType);
            formData.append('items', loadedData);
            const response = await axios.post('http://localhost:8000/integrations/insights', formData);
            setInsights(JSON.stringify(response.data, null, 2));
            setInsightsObj(response.data);
        } catch (e) {
            alert(e?.response?.data?.detail);
        } finally {
            setIsGeneratingMl(false);
        }
    };

    const handleOpenPrompt = () => {
        if (!loadedData) {
            alert('Load integration data before generating LLM insights.');
            return;
        }
        setShowPromptBox(true);
    };

    const handleGenerateLlm = async () => {
        try {
            if (!loadedData) {
                alert('Load integration data before generating LLM insights.');
                return;
            }
            setIsGeneratingLlm(true);
            const formData = new FormData();
            formData.append('integration_type', integrationType);
            formData.append('items', loadedData);
            formData.append('analyst_prompt', analystPrompt);
            const response = await axios.post('http://localhost:8000/integrations/insights/llm', formData);
            setLlmInsights(response.data);
            setShowLlmOutput(true);
        } catch (e) {
            alert(e?.response?.data?.detail);
        } finally {
            setIsGeneratingLlm(false);
        }
    };

    const clearAll = () => {
        setLoadedData(null);
        setInsights(null);
        setInsightsObj(null);
        setLlmInsights(null);
        setAnalystPrompt(DEFAULT_ANALYST_PROMPT);
        setShowPromptBox(false);
        setShowLlmOutput(false);
        setSelectedMetric(null);
        setPublishResult(null);
        setTypeFilter('all');
        setPage(1);
        setSelectedRecord(null);
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
            if (llmInsights?.insight) {
                formData.append('llm_insight', JSON.stringify(llmInsights));
            }
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
                    <TextField label="Loaded Data" value={loadedData || ''} sx={{ mt: 2 }} InputLabelProps={{ shrink: true }} disabled />
                    <Button onClick={handleLoad} sx={{ mt: 2 }} variant='contained'>Load Data</Button>
                    <Button onClick={clearAll} sx={{ mt: 1 }} variant='contained'>Clear Data</Button>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ width: 'min(1060px, 94vw)', mt: 2 }}>
            <Typography variant='h6' sx={{ mb: 1 }}>AI Insights Dashboard</Typography>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', background: '#f6f9ff', border: '1px solid #d8e6ff', borderRadius: 2, p: 1.2 }}>
                <Button onClick={handleLoad} variant='contained' disabled={isLoadingData}>
                    {isLoadingData ? <CircularProgress size={18} color='inherit' /> : 'Load Data'}
                </Button>
                <Button onClick={() => setShowNotionConfig(true)} variant='outlined' color='info'>
                    Notion Configure
                </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
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
                                <Typography key={`h-${c.feature}`} variant='body2'>- {c.feature}: value {c.value}, weight {c.weight}, contribution {c.impact}</Typography>
                            ))}
                        </Box>
                    )}
                    {selectedMetric === 'automation_opportunity' && autoExplain && (
                        <Box sx={{ mt: 1 }}>
                            <Typography variant='body2'><strong>Formula:</strong> {autoExplain.formula}</Typography>
                            {autoExplain.contributors.map((c) => (
                                <Typography key={`a-${c.feature}`} variant='body2'>- {c.feature}: value {c.value}, weight {c.weight}, contribution {c.impact}</Typography>
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

            <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button onClick={handleInsights} variant='contained' color='success' disabled={isGeneratingMl}>
                        {isGeneratingMl ? <CircularProgress size={18} color='inherit' /> : 'Generate ML Insights'}
                    </Button>
                    <Button onClick={handleOpenPrompt} variant='contained' color='secondary'>Generate LLM Insights (Gemini)</Button>
                    <Button onClick={clearAll} variant='outlined'>Clear</Button>
                </Box>
                <Typography variant='body2' sx={{ mt: 1, textAlign: 'center' }}>
                    Data Load Status: {loadedData ? `Loaded ${parsedLoaded.length} records.` : 'Not loaded'}
                </Typography>
            </Paper>

            {showPromptBox && (
                <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                    <Typography variant='subtitle1'>LLM Prompt</Typography>
                    <TextField
                        value={analystPrompt}
                        onChange={(e) => setAnalystPrompt(e.target.value)}
                        sx={{ mt: 1 }}
                        multiline
                        minRows={3}
                        fullWidth
                    />
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                        <Button variant='outlined' onClick={() => setAnalystPrompt('')}>Clear Prompt</Button>
                        <Button variant='outlined' onClick={() => setAnalystPrompt(DEFAULT_ANALYST_PROMPT)}>Default Prompt</Button>
                        <Button variant='contained' color='secondary' onClick={handleGenerateLlm} disabled={isGeneratingLlm}>
                            {isGeneratingLlm ? <CircularProgress size={18} color='inherit' /> : 'Generate'}
                        </Button>
                    </Box>
                </Paper>
            )}

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

            <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
                <Typography variant='subtitle1'>Records</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    {typeOptions.map((t) => (
                        <Chip
                            key={`f-${t}`}
                            label={t === 'all' ? 'all' : t}
                            color={typeFilter === t ? 'primary' : 'default'}
                            onClick={() => { setTypeFilter(t); setPage(1); }}
                        />
                    ))}
                </Box>

                <Box sx={{ mt: 2, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                    {pageItems.map((item) => (
                        <Paper key={item.id} variant='outlined' sx={{ p: 1.5, cursor: 'pointer' }} onClick={() => setSelectedRecord(item)}>
                            <Typography variant='subtitle2'>{pretty(item.name)}</Typography>
                            <Typography variant='body2'>ID: {pretty(item.id)}</Typography>
                            <Typography variant='body2'>Type: {pretty(item.type)}</Typography>
                            <Typography variant='body2'>Created: {pretty(item.creation_time)}</Typography>
                        </Paper>
                    ))}
                </Box>

                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                    <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color='primary' />
                </Box>
            </Paper>

            <Dialog open={Boolean(selectedRecord)} onClose={() => setSelectedRecord(null)} maxWidth='md' fullWidth>
                <DialogTitle>Record Details</DialogTitle>
                <DialogContent>
                    {selectedRecord && (
                        <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
                            {Object.entries(selectedRecord).map(([k, v]) => (
                                <Paper key={`kv-${k}`} variant='outlined' sx={{ p: 1 }}>
                                    <Typography variant='body2'><strong>{k}</strong></Typography>
                                    <Typography variant='body2' sx={{ wordBreak: 'break-word' }}>{pretty(typeof v === 'object' ? JSON.stringify(v) : v)}</Typography>
                                </Paper>
                            ))}
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={showNotionConfig} onClose={() => setShowNotionConfig(false)} maxWidth='sm' fullWidth>
                <DialogTitle>Notion Publishing Settings</DialogTitle>
                <DialogContent>
                    <TextField
                        label='Notion Access Token'
                        value={notionToken}
                        onChange={(e) => setNotionToken(e.target.value)}
                        sx={{ mt: 1 }}
                        fullWidth
                    />
                    <TextField
                        label='Notion Parent Page ID'
                        value={notionParentPageId}
                        onChange={(e) => setNotionParentPageId(e.target.value)}
                        sx={{ mt: 1 }}
                        fullWidth
                    />
                    {publishResult?.notion_page_url && (
                        <Typography sx={{ mt: 1 }}>
                            Published: <a href={publishResult.notion_page_url} target='_blank' rel='noreferrer'>{publishResult.notion_page_url}</a>
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleSaveSettings} variant='outlined'>Save</Button>
                    <Button onClick={handlePublishToNotion} variant='contained' color='info'>Publish to Notion</Button>
                    <Button onClick={() => setShowNotionConfig(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Box sx={{ mt: 2 }}>
                <FormControlLabel
                    control={<Switch checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} />}
                    label='Show Debug JSON'
                />
                {showDebug && (
                    <>
                        <TextField
                            label='Loaded Data (Raw)'
                            value={loadedData || ''}
                            sx={{ mt: 1 }}
                            InputLabelProps={{ shrink: true }}
                            disabled
                            multiline
                            minRows={5}
                            fullWidth
                        />
                        <TextField
                            label='ML Based Insights (Raw)'
                            value={insights || ''}
                            sx={{ mt: 2 }}
                            InputLabelProps={{ shrink: true }}
                            disabled
                            multiline
                            minRows={5}
                            fullWidth
                        />
                        <TextField
                            label='LLM Insights (Raw)'
                            value={llmInsights ? JSON.stringify(llmInsights, null, 2) : ''}
                            sx={{ mt: 2 }}
                            InputLabelProps={{ shrink: true }}
                            disabled
                            multiline
                            minRows={5}
                            fullWidth
                        />
                    </>
                )}
            </Box>
        </Box>
    );
};
