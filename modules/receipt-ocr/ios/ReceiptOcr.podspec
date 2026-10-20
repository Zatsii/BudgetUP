Pod::Spec.new do |s|
  s.name           = 'ReceiptOcr'
  s.version        = '1.0.0'
  s.summary        = 'On-device receipt text recognition with line positions (Apple Vision)'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'BudgetUP'
  s.homepage       = 'https://example.invalid/budgetup'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift}"
end
