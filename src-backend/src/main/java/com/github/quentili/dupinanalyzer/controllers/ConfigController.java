package com.github.quentili.dupinanalyzer.controllers;

import com.github.quentili.dupinanalyzer.models.ConfigResponse;
import com.github.quentili.dupinanalyzer.models.CreateConfigRequest;
import com.github.quentili.dupinanalyzer.service.ConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/config")
public class ConfigController {
    private final ConfigService configService;

    @GetMapping("/configs")
    public ResponseEntity<List<ConfigResponse>> getConfigsList() {
        return configService.getConfigsList();
    }

    @PostMapping("/configs")
    public ResponseEntity<ConfigResponse> createConfig(@RequestBody CreateConfigRequest request) {
        return configService.createConfig(request);
    }
}