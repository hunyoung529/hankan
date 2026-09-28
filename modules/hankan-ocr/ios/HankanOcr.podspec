Pod::Spec.new do |s|
  s.name = 'HankanOcr'
  s.version = '0.1.0'
  s.summary = 'On-device food label text recognition'
  s.description = 'Local Apple Vision recognition for Hankan.'
  s.author = 'Hankan'
  s.homepage = 'https://example.invalid/hankan'
  s.license = { :type => 'Proprietary' }
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'Vision', 'ImageIO'
end
