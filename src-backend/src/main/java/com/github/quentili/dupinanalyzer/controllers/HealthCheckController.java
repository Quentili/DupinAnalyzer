package com.github.quentili.dupinanalyzer.controllers;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthCheckController {

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("ok", LocalDateTime.now());
    }
}
