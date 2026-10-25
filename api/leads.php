<?php
// POST /api/leads.php
//
// Receives the report-download and partner-enquiry forms from index-v4.html,
// validates them and emails each lead to the La Tech Made in Italy team with the
// hosting's own mail() (OVH web hosting; SPF for italiantechlandscape.com
// already includes mx.ovh.com).

const LEADS_TO = ['max@latechmadeinitaly.com', 'floriana@latechmadeinitaly.com', 'r.salentini@gmail.com'];
const LEADS_FROM = 'noreply@italiantechlandscape.com';
const LEADS_FROM_NAME = 'Italian Tech Landscape';
const MAX = ['name' => 80, 'email' => 254, 'company' => 120, 'role' => 120, 'message' => 2000];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function reply($status, $data) {
  http_response_code($status);
  echo json_encode($data);
  exit;
}

function clean($value, $max) {
  $s = is_scalar($value) ? trim((string) $value) : '';
  return mb_substr($s, 0, $max, 'UTF-8');
}

// Header values must never carry line breaks
function oneline($s) {
  return trim(preg_replace('/[\r\n]+/', ' ', $s));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['ok' => false, 'error' => 'method']);

$raw = file_get_contents('php://input', false, null, 0, 20000);
$body = json_decode($raw, true);
if (!is_array($body)) reply(400, ['ok' => false, 'error' => 'invalid-json']);

$type = $body['type'] ?? '';
$email = clean($body['email'] ?? '', MAX['email']);
$errors = [];
if (($body['consent'] ?? false) !== true) $errors[] = 'consent';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'email';

$lead = [
  'firstName' => clean($body['firstName'] ?? '', MAX['name']),
  'lastName' => clean($body['lastName'] ?? '', MAX['name']),
  'name' => clean($body['name'] ?? '', MAX['name']),
  'company' => clean($body['company'] ?? '', MAX['company']),
  'role' => clean($body['role'] ?? '', MAX['role']),
  'size' => clean($body['size'] ?? '', 20),
  'interest' => clean($body['interest'] ?? '', 80),
  'tier' => clean($body['tier'] ?? '', 20),
  'message' => clean($body['message'] ?? '', MAX['message']),
  'newsletter' => ($body['newsletter'] ?? false) === true,
  'lang' => ($body['lang'] ?? '') === 'it' ? 'IT' : 'EN',
  'submittedAt' => clean($body['submittedAt'] ?? '', 40) ?: gmdate('c'),
];

if ($type === 'report') {
  foreach (['firstName', 'lastName', 'company', 'role', 'size', 'interest'] as $k) if ($lead[$k] === '') $errors[] = $k;
} elseif ($type === 'partner') {
  foreach (['name', 'company'] as $k) if ($lead[$k] === '') $errors[] = $k;
} else {
  $errors[] = 'type';
}
if ($errors) reply(422, ['ok' => false, 'errors' => $errors]);

// The team reads Italian: labels and subject are in Italian
$report = $type === 'report';
$who = $report ? $lead['firstName'] . ' ' . $lead['lastName'] : $lead['name'];
$rows = $report
  ? [['Nome', $who], ['Email', $email], ['Azienda', $lead['company']], ['Ruolo', $lead['role']], ['Dimensione azienda', $lead['size']], ['Categoria di interesse', $lead['interest']], ['Newsletter', $lead['newsletter'] ? 'Sì' : 'No']]
  : [['Nome', $who], ['Email', $email], ['Azienda', $lead['company']], ['Partnership', $lead['tier'] ?: 'Non ancora deciso'], ['Messaggio', $lead['message'] ?: '—']];
$rows[] = ['Lingua del sito', $lead['lang']];
$rows[] = ['Inviato il', $lead['submittedAt']];

$subject = oneline($report ? "Download report ITL 2026: $who, {$lead['company']}" : "Richiesta partnership ITL 27: $who, {$lead['company']}");
$h = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$html = '<h2 style="font-family:sans-serif">' . ($report ? 'Nuovo download del report' : 'Nuova richiesta di partnership') . '</h2><table style="font-family:sans-serif;border-collapse:collapse">';
foreach ($rows as [$k, $v]) $html .= '<tr><td style="padding:6px 16px 6px 0;color:#3F4C66;vertical-align:top">' . $h($k) . '</td><td style="padding:6px 0;white-space:pre-wrap">' . $h($v) . '</td></tr>';
$html .= '</table>';

$headers = [
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=UTF-8',
  'From: ' . mb_encode_mimeheader(LEADS_FROM_NAME, 'UTF-8') . ' <' . LEADS_FROM . '>',
  'Reply-To: ' . oneline($email),
];
$sent = mail(implode(', ', LEADS_TO), mb_encode_mimeheader($subject, 'UTF-8'), $html, implode("\r\n", $headers), '-f' . LEADS_FROM);

if (!$sent) {
  error_log('leads: mail() failed for ' . $type);
  reply(502, ['ok' => false, 'error' => 'mail']);
}
reply(200, ['ok' => true]);
