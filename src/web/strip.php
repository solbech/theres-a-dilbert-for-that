<?php
// Sends one strip, by date, from the archive outside the web root. Run this behind the login in .htaccess.
// The archive holds year folders of files named YYYY-MM-DD... Change $root if it is not next to the web root.
$root = dirname(__DIR__) . '/strips_archive';
$types = ['gif' => 'image/gif', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png'];

$date = $_GET['date'] ?? '';
if (!is_string($date) || !preg_match('/^(\d{4})-\d{2}-\d{2}$/D', $date, $m)) {
  http_response_code(400);
  exit;
}
foreach (glob("$root/{$m[1]}/$date*") ?: [] as $file) {
  $type = $types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? null;
  if (!$type) continue;
  header("Content-Type: $type");
  header('Content-Length: ' . filesize($file));
  header('Cache-Control: private, max-age=604800');
  header('X-Content-Type-Options: nosniff');
  readfile($file);
  exit;
}
http_response_code(404);
