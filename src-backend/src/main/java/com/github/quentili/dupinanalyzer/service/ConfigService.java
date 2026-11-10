package com.github.quentili.dupinanalyzer.service;

import com.github.quentili.dupinanalyzer.entity.ConfigEntity;
import com.github.quentili.dupinanalyzer.entity.ConfigPatternEntity;
import com.github.quentili.dupinanalyzer.models.ConfigPattern;
import com.github.quentili.dupinanalyzer.models.ConfigResponse;
import com.github.quentili.dupinanalyzer.models.CreateConfigRequest;
import com.github.quentili.dupinanalyzer.repository.ConfigRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ConfigService {
    private final ConfigRepository configRepository;

    public ResponseEntity<List<ConfigResponse>> getConfigsList() {
        List<ConfigEntity> all = configRepository.findAll();

        if (all.isEmpty()) return ResponseEntity.notFound().build();

        List<ConfigResponse> responseList = all.stream()
                .map(entity -> {
                    List<ConfigPattern> patterns = entity.getPatterns().stream()
                            .map(patternEntity -> new ConfigPattern(
                                    patternEntity.getName(),
                                    patternEntity.getPattern(),
                                    patternEntity.getGroups(),
                                    patternEntity.getColor()
                            ))
                            .toList();

                    return new ConfigResponse(entity.getConfigName(), patterns);
                })
                .toList();

        return ResponseEntity.ok(responseList);
    }

    @Transactional
    public ResponseEntity<ConfigResponse> createConfig(CreateConfigRequest request) {
        ConfigEntity configEntity = new ConfigEntity();
        configEntity.setConfigName(request.name());

        if (request.patterns() != null) {
            List<ConfigPatternEntity> patternEntities = request.patterns().stream()
                    .map(dto -> {
                        ConfigPatternEntity pattern = new ConfigPatternEntity();
                        pattern.setName(dto.name());
                        pattern.setPattern(dto.pattern());
                        pattern.setColor(dto.color());
                        pattern.setGroups(dto.groups() != null ? new ArrayList<>(dto.groups()) : new ArrayList<>());

                        pattern.setConfig(configEntity);
                        return pattern;
                    })
                    .toList();

            configEntity.setPatterns(patternEntities);
        }

        ConfigEntity saved = configRepository.save(configEntity);

        List<ConfigPattern> responsePatterns = saved.getPatterns().stream()
                .map(pattern -> new ConfigPattern(
                        pattern.getName(),
                        pattern.getPattern(),
                        pattern.getGroups(),
                        pattern.getColor()
                ))
                .toList();

        ConfigResponse response = new ConfigResponse(saved.getConfigName(), responsePatterns);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}