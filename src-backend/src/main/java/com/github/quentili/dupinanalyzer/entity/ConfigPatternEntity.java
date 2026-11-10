package com.github.quentili.dupinanalyzer.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Entity
@NoArgsConstructor
@Table(name = "config_patterns")
public class ConfigPatternEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;
    private String pattern;
    private String color;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "config_id", nullable = false)
    private ConfigEntity config;

    @ElementCollection
    @Column(name = "group_name")
    @CollectionTable(name = "pattern_groups", joinColumns = @JoinColumn(name = "pattern_id"))
    private List<String> groups = new ArrayList<>();
}