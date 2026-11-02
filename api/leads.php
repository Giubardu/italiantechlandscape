<?php
// POST /api/leads.php
//
// Receives the report-download and partner-enquiry forms from index-v4.html,
// validates them, emails each lead to the La Tech Made in Italy team with the
// hosting's own mail() (OVH web hosting; SPF for italiantechlandscape.com
// already includes mx.ovh.com) and forwards it to the client's Zapier webhook,
// which loads the contact into their CRM (ADA).

const LEADS_TO = ['max@latechmadeinitaly.com', 'floriana@latechmadeinitaly.com', 'r.salentini@gmail.com'];
const LEADS_FROM = 'noreply@italiantechlandscape.com';
const LEADS_FROM_NAME = 'Italian Tech Landscape';
const MAX = ['name' => 80, 'email' => 254, 'phone' => 24, 'company' => 120, 'role' => 120, 'other' => 80, 'message' => 2000];
// Zap "ITL": catches every lead (report and partner, told apart by "type") and creates the contact in ADA.
// The hook URL is a secret (anyone holding it can post contacts into the CRM), so it lives outside the
// public repo and outside public_html: /home/<ovh-user>/itl-config.php, returning ['zapier_hook' => 'https://…'].
// Deploy Git never touches that folder. Without the file, leads still go out by email.
const CONFIG_FILE = __DIR__ . '/../../itl-config.php';
// Report downloads only from business addresses (client rule). Keep in step with site.js.
const FREE_MAIL = '/@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|libero|virgilio|tiscali|alice|tim|fastwebnet|inwind|email|katamail|gmx|proton|protonmail|pm|yandex|mail|zoho)\./i';
const GENERIC_MAIL = '/^(info|contact|contacts|contatti|admin|office|segreteria|amministrazione|hello|mail|noreply|no-reply)@/i';
const ALLOWED_ORIGINS = ['https://italiantechlandscape.com'];
// Flood protection: per visitor, and for the whole site, so the team inbox can't be spammed
const LIMIT_PER_IP = 5;       // submissions per IP...
const LIMIT_WINDOW = 600;     // ...per 10 minutes
const LIMIT_GLOBAL = 60;      // submissions per hour in total

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

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

// Counts hits for $key inside a sliding window, in the system temp dir (outside the website folder)
// POSTs the lead as JSON to Zapier. A failure is logged, never shown to the visitor: the email still reaches the team.
function to_zapier($payload) {
  $config = is_file(CONFIG_FILE) ? include CONFIG_FILE : [];
  $hook = is_array($config) ? ($config['zapier_hook'] ?? '') : '';
  if ($hook === '') { error_log('leads: no zapier_hook in ' . CONFIG_FILE); return false; }
  $ch = curl_init($hook);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_TIMEOUT => 8,
  ]);
  curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  if ($code < 200 || $code >= 300) error_log('leads: zapier failed, HTTP ' . $code . ' ' . curl_error($ch));
  curl_close($ch);
  return $code >= 200 && $code < 300;
}

function over_limit($key, $max, $window) {
  $file = sys_get_temp_dir() . '/itl-leads-' . hash('sha256', $key . __FILE__);
  $fh = @fopen($file, 'c+');
  if (!$fh) return false;
  flock($fh, LOCK_EX);
  $now = time();
  $hits = array_filter(array_map('intval', explode(',', stream_get_contents($fh))), fn($t) => $t > $now - $window);
  $blocked = count($hits) >= $max;
  if (!$blocked) $hits[] = $now;
  ftruncate($fh, 0); rewind($fh); fwrite($fh, implode(',', $hits));
  flock($fh, LOCK_UN); fclose($fh);
  return $blocked;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, ['ok' => false, 'error' => 'method']);
// Only the site's own pages may post here (browsers always send Origin on fetch POSTs)
if (!in_array($_SERVER['HTTP_ORIGIN'] ?? '', ALLOWED_ORIGINS, true)) reply(403, ['ok' => false, 'error' => 'origin']);
// JSON only: a cross-site form can't send this content type without a CORS preflight, which we never grant
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) reply(415, ['ok' => false, 'error' => 'type']);
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
if (over_limit('ip:' . $ip, LIMIT_PER_IP, LIMIT_WINDOW) || over_limit('global', LIMIT_GLOBAL, 3600)) reply(429, ['ok' => false, 'error' => 'rate']);

$raw = file_get_contents('php://input', false, null, 0, 20000);
$body = json_decode($raw, true);
if (!is_array($body)) reply(400, ['ok' => false, 'error' => 'invalid-json']);

// Honeypot: a hidden field people never fill. Bots get a normal-looking answer and nothing is sent.
if (trim((string) ($body['website'] ?? '')) !== '') reply(200, ['ok' => true]);

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
  'phone' => clean($body['phone'] ?? '', MAX['phone']),
  'role' => clean($body['role'] ?? '', MAX['role']),
  'interest' => clean($body['interest'] ?? '', 80),
  'interestOther' => clean($body['interestOther'] ?? '', MAX['other']),
  'source' => clean($body['source'] ?? '', 40),
  'sourceOther' => clean($body['sourceOther'] ?? '', MAX['other']),
  'tier' => clean($body['tier'] ?? '', 20),
  'message' => clean($body['message'] ?? '', MAX['message']),
  'terms' => ($body['terms'] ?? false) === true,
  'lang' => ($body['lang'] ?? '') === 'it' ? 'IT' : 'EN',
  'submittedAt' => clean($body['submittedAt'] ?? '', 40) ?: gmdate('c'),
];

if ($type === 'report') {
  foreach (['firstName', 'lastName', 'phone', 'company', 'role', 'interest', 'source'] as $k) if ($lead[$k] === '') $errors[] = $k;
  if ($lead['phone'] !== '' && !preg_match('/^[0-9 +().\-]{6,24}$/', $lead['phone'])) $errors[] = 'phone';
  if (!$lead['terms']) $errors[] = 'terms';
  if (preg_match(FREE_MAIL, $email) || preg_match(GENERIC_MAIL, $email)) $errors[] = 'email-business';
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
  ? [['Nome', $who], ['Email', $email], ['Telefono', $lead['phone']], ['Azienda', $lead['company']], ['Job title', $lead['role']], ['Categoria di interesse', $lead['interest'] . ($lead['interestOther'] !== '' ? ' — ' . $lead['interestOther'] : '')], ['Come ci ha conosciuto', $lead['source'] . ($lead['sourceOther'] !== '' ? ' — ' . $lead['sourceOther'] : '')], ['Consensi', 'Privacy (art. 13 GDPR) e termini e condizioni / iscrizione alla community: accettati']]
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
$zapped = to_zapier(['type' => $type, 'email' => $email] + $lead + ['privacyConsent' => true, 'page' => clean($body['page'] ?? '', 120)]);
$sent = mail(implode(', ', LEADS_TO), mb_encode_mimeheader($subject, 'UTF-8'), $html, implode("\r\n", $headers), '-f' . LEADS_FROM);

// The lead counts as delivered if it reached the team by email or the CRM through Zapier
if (!$sent) error_log('leads: mail() failed for ' . $type);
if (!$sent && !$zapped) reply(502, ['ok' => false, 'error' => 'mail']);
reply(200, ['ok' => true]);
